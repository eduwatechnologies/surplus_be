const bcrypt = require("bcryptjs");
const User = require("../../models/userModel");
const Tenant = require("../../models/tenantModel");
const TenantPlanPrice = require("../../models/tenantPlanPriceModel");
const servicePlanModel = require("../../models/servicePlanModel");
const saveTransaction = require("../../utils/functions/saveTransaction");
const EasyAccessService = require("../../providers/easyAccess");

const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
  enforceTenantRiskControls,
  runInMongoTransaction,
} = require("../../business_logic/billstackLogic");

const ALLOWED_PIN_COUNTS = [1, 2, 3, 4, 5, 10];

const httpError = (statusCode, message) => {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
};

const toTransactionSummary = (t) => {
  if (!t) return null;
  return {
    _id: t._id,
    service: t.service,
    status: t.status,
    message: t.message,
    amount: t.amount,
    reference_no: t.reference_no,
    provider_reference: t.provider_reference,
    createdAt: t.createdAt,
    previous_balance: t.previous_balance,
    new_balance: t.new_balance,
  };
};

function computeSellingPrice(basePrice, override) {
  const base = Number(basePrice);
  if (!Number.isFinite(base) || base <= 0) return null;
  if (!override || override.active === false) return base;

  const value = Number(override.value);
  if (!Number.isFinite(value)) return base;

  if (override.pricingType === "fixed") {
    return value >= base ? value : base;
  }
  if (override.pricingType === "flat_markup") {
    return base + value;
  }
  if (override.pricingType === "percent_markup") {
    return base + (base * value) / 100;
  }
  return base;
}

const purchaseExamPin = async (req, res) => {
  try {
    const result = await runInMongoTransaction(async (session) => {
      const authUserId = req.user?._id;
      const { noOfPin, userId: bodyUserId, pinCode, planId } = req.body;

      if (!authUserId) throw httpError(401, "Not authorized");
      if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
        throw httpError(403, "User mismatch");
      }

      if (!noOfPin || !planId) {
        throw httpError(400, "Missing required fields: 'noOfPin', 'planId'");
      }

      if (!ALLOWED_PIN_COUNTS.includes(Number(noOfPin))) {
        throw httpError(
          400,
          "Invalid number of pins. Allowed values: 1, 2, 3, 4, 5, 10"
        );
      }

      const userId = authUserId;
      const user = await User.findById(userId).session(session);
      if (!user) throw httpError(404, "User not found");

      const plan = await servicePlanModel
        .findById(planId)
        .populate("subServiceId")
        .session(session);

      if (!plan || !plan.active) {
        throw httpError(404, "Selected plan not found or inactive");
      }

      const baseUnitPrice = Number(plan.ourPrice);
      if (!Number.isFinite(baseUnitPrice) || baseUnitPrice <= 0) {
        throw httpError(400, "Invalid plan pricing");
      }

      let effectiveTenantId = user.tenantId || null;
      let tenantOwnerUserId = null;
      if (effectiveTenantId) {
        const tenant = await Tenant.findById(effectiveTenantId)
          .select("status ownerUserId")
          .session(session);
        if (!tenant || tenant.status !== "active") {
          effectiveTenantId = null;
        } else {
          tenantOwnerUserId = tenant.ownerUserId || null;
        }
      }

      let override = null;
      if (effectiveTenantId) {
        override =
          (await TenantPlanPrice.findOne({
            tenantId: effectiveTenantId,
            userId: user._id,
            planId: plan._id,
            active: true,
          })
            .select("pricingType value active")
            .session(session)) ||
          (await TenantPlanPrice.findOne({
            tenantId: effectiveTenantId,
            userId: null,
            planId: plan._id,
            active: true,
          })
            .select("pricingType value active")
            .session(session));
      }

      const rawSellingUnit = computeSellingPrice(baseUnitPrice, override);
      const sellingUnitPrice =
        rawSellingUnit === null ? null : Math.round(rawSellingUnit);
      if (!Number.isFinite(sellingUnitPrice) || sellingUnitPrice <= 0) {
        throw httpError(400, "Unable to compute selling price");
      }

      const baseTotalCost = baseUnitPrice * Number(noOfPin);
      const totalCost = sellingUnitPrice * Number(noOfPin);
      const previousBalance = user.balance;

      const { pinRequired } = await enforceTenantRiskControls({
        user,
        amount: totalCost,
        service: "exam_pin",
        session,
      });
      if (pinRequired || user.pinStatus) {
        if (!pinCode || typeof pinCode !== "string") {
          throw httpError(400, "Transaction PIN is required");
        }
        if (!user.pinCode) {
          throw httpError(400, "Set your transaction PIN to continue");
        }
        const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
        if (!isPinValid) {
          throw httpError(401, "Invalid transaction PIN");
        }
      }

      if (user.balance < totalCost) {
        throw httpError(
          400,
          `Insufficient balance. You need at least ₦${totalCost}`
        );
      }

      const debitResult = await deductFromVirtualAccount(
        userId,
        totalCost,
        session
      );

      const enabledApi = plan.provider;
      if (enabledApi !== "easyaccess") {
        throw httpError(400, "Invalid provider configured for this plan");
      }

      const providerResult = await EasyAccessService.purchaseExamPin({
        no_of_pins: noOfPin,
        type: plan.category,
      });

      const isSuccess =
        providerResult?.success === true ||
        providerResult?.status === true ||
        providerResult?.data?.success === true;

      const txnExtra = {
        userId,
        tenantId: effectiveTenantId,
        tenantOwnerUserId,
        platform_price: baseTotalCost,
        selling_price: totalCost,
        merchant_profit: totalCost - baseTotalCost,
        planId,
        noOfPin,
        amount: totalCost,
        provider: enabledApi,
      };

      const isFailure = !isSuccess;
      let finalBalance = debitResult?.new_balance ?? previousBalance;
      if (isFailure) {
        const refundResult = await refundToVirtualAccount(
          userId,
          totalCost,
          session
        );
        finalBalance = refundResult?.new_balance ?? previousBalance;
      }

      const savedTx = await saveTransaction(
        {
          response: providerResult || {},
          serviceType: "exam_pin",
          status: isFailure ? "failed" : "success",
          extra: txnExtra,
          previous_balance: previousBalance,
          new_balance: finalBalance,
        },
        { session }
      );

      return isFailure
        ? {
            status: 400,
            body: {
              success: false,
              message:
                providerResult?.data?.message ||
                providerResult?.error ||
                "Exam pin purchase failed",
              transactionId: savedTx?._id,
              request_id: savedTx?._id,
              transaction: toTransactionSummary(savedTx),
            },
          }
        : {
            status: 200,
            body: {
              success: true,
              message: "✅ Exam pin purchase successful",
              data: providerResult.data,
              transactionId: savedTx?._id,
              request_id: savedTx?._id,
              transaction: toTransactionSummary(savedTx),
            },
          };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Error purchasing exam pin:", error);
    const status = error?.statusCode && Number.isFinite(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({ success: false, message: error.message || "Internal Server Error" });
  }
};

module.exports = { purchaseExamPin };
