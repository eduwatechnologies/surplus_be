const saveTransaction = require("../../utils/functions/saveTransaction");
const EasyAccessService = require("../../providers/easyAccess");
const AutopilotService = require("../../providers/autopilot");
const ServicePlan = require("../../models/servicePlanModel");
const Tenant = require("../../models/tenantModel");
const TenantPlanPrice = require("../../models/tenantPlanPriceModel");
const User = require("../../models/userModel");
const bcrypt = require("bcryptjs");

const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
  enforceTenantRiskControls,
  runInMongoTransaction,
} = require("../../business_logic/billstackLogic");
const getDataTypeFromPlanId = require("../../utils/functions/dataTypeFormatter");
const CategoryProvider = require("../../models/testingCategoryProviderModel");
const NETWORK_PREFIXES = require("../../utils/constant/networkPrefix");

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

const NETWORK_MAP = {
  // Airtime/Data
  mtn: { easyaccess: "01", autopilot: "1" },
  airtel: { easyaccess: "03", autopilot: "2" },
  glo: { easyaccess: "02", autopilot: "3" },
  "9mobile": { easyaccess: "04", autopilot: "4" },
};

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
    network: t.network,
    mobile_no: t.mobile_no,
    data_type: t.data_type,
    previous_balance: t.previous_balance,
    new_balance: t.new_balance,
  };
};

const purchaseData = async (req, res) => {
  try {
    const result = await runInMongoTransaction(async (session) => {
      const authUserId = req.user?._id;
      const { phone, userId: bodyUserId, pinCode, planId, networkId } = req.body;

      if (!authUserId) throw httpError(401, "Not authorized");
      if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
        throw httpError(403, "User mismatch");
      }
      if (!phone || !planId || !networkId) {
        throw httpError(400, "Missing required fields");
      }

      const phonePrefix4 = phone.substring(0, 4);
      const phonePrefix5 = phone.substring(0, 5);
      const validPrefixes = NETWORK_PREFIXES[networkId.toLowerCase()];
      if (
        !validPrefixes ||
        (!validPrefixes.includes(phonePrefix4) &&
          !validPrefixes.includes(phonePrefix5))
      ) {
        throw httpError(
          400,
          `❌ Phone number ${phone} does not match ${networkId.toUpperCase()} network.`
        );
      }

      const userId = authUserId;
      const user = await User.findById(userId).session(session);
      if (!user) throw httpError(404, "User not found");

      const plan = await ServicePlan.findById(planId)
        .populate("subServiceId")
        .session(session);
      if (!plan) throw httpError(404, "Plan not found");

      const detectedDataType = getDataTypeFromPlanId(plan.autopilotId);

      const normalizedCategory = String(plan.category || "").toUpperCase().trim();
      const categoryProvider = await CategoryProvider.findOne({
        subServiceId: plan.subServiceId?._id,
        network: String(networkId || "").toUpperCase().trim(),
        category: normalizedCategory,
      }).session(session);

      const basePrice = Number(plan.ourPrice);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
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

      const rawSellingPrice = computeSellingPrice(basePrice, override);
      const sellingPrice =
        rawSellingPrice === null ? null : Math.round(rawSellingPrice);
      if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
        throw httpError(400, "Unable to compute selling price");
      }

      const { pinRequired } = await enforceTenantRiskControls({
        user,
        amount: sellingPrice,
        service: "data",
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

      if (!categoryProvider || categoryProvider.status === false) {
        throw httpError(400, "This category is currently unavailable");
      }

      const enabledApi = categoryProvider.provider;
      const previousBalance = user?.balance;

      const debitResult = await deductFromVirtualAccount(
        userId,
        sellingPrice,
        session
      );

      const networkKey = networkId.toLowerCase();
      const mappedCodes = NETWORK_MAP[networkKey];
      if (!mappedCodes) throw httpError(400, "Invalid network selected");

      let providerResult;
      if (enabledApi === "autopilot") {
        providerResult = await AutopilotService.purchaseData({
          networkId: mappedCodes.autopilot,
          dataType: detectedDataType,
          planId: plan.autopilotId,
          phone,
        });
      } else if (enabledApi === "easyaccess") {
        providerResult = await EasyAccessService.purchaseData({
          network: mappedCodes.easyaccess,
          dataplan: plan.easyaccessId,
          phone,
        });
      } else {
        throw httpError(400, "No enabled provider for this sub-service");
      }

      const isFailure =
        !providerResult ||
        providerResult.success === false ||
        providerResult.data?.success === false ||
        providerResult.data?.success === "false" ||
        providerResult.data?.success === "false_disabled" ||
        providerResult.data?.code === 201 ||
        providerResult.status === false;

      const txnExtra = {
        userId,
        amount: sellingPrice,
        tenantId: effectiveTenantId,
        tenantOwnerUserId,
        platform_price: basePrice,
        selling_price: sellingPrice,
        merchant_profit: sellingPrice - basePrice,
        phone,
        network: networkId,
        dataplan: plan?.name || "",
        client_reference: providerResult?.data?.client_reference,
      };

      let finalBalance = debitResult?.new_balance ?? previousBalance;
      if (isFailure) {
        const refundResult = await refundToVirtualAccount(
          userId,
          sellingPrice,
          session
        );
        finalBalance = refundResult?.new_balance ?? previousBalance;
      }

      const savedTxn = await saveTransaction(
        {
          response: providerResult || {},
          serviceType: "data",
          status: isFailure ? "failed" : "success",
          extra: txnExtra,
          transaction_type: "debit",
          previous_balance: previousBalance,
          new_balance: finalBalance,
        },
        { session }
      );

      return isFailure
        ? {
            status: 400,
            body: {
              message: "❌ Data purchase failed",
              error:
                providerResult?.data?.message ||
                providerResult?.error ||
                "Unknown error from provider",
              transactionId: savedTxn?._id,
              transaction: toTransactionSummary(savedTxn),
              success: false,
            },
          }
        : {
            status: 200,
            body: {
              message: "✅ Data bundle purchased successfully",
              transactionId: savedTxn?._id,
              transaction: toTransactionSummary(savedTxn),
              success: true,
            },
          };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("❌ Error purchasing data:", error);
    const status = error?.statusCode && Number.isFinite(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({ error: error.message || "An unexpected error occurred" });
  }
};

module.exports = {
  purchaseData,
};
