const EasyAccessService = require("../../providers/easyAccess");
const AutopilotService = require("../../providers/autopilot");
const User = require("../../models/userModel");
const bcrypt = require("bcryptjs");
const ServicePlan = require("../../models/servicePlanModel");
const Tenant = require("../../models/tenantModel");
const TenantPlanPrice = require("../../models/tenantPlanPriceModel");
const saveTransaction = require("../../utils/functions/saveTransaction");

const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
  enforceTenantRiskControls,
  chargeMerchantTransactionFee,
  runInMongoTransaction,
} = require("../../business_logic/billstackLogic");
const NETWORK_MAP = {
  dstv: { easyaccess: "01", autopilot: "1" },
  gotv: { easyaccess: "02", autopilot: "2" },
  startimes: { easyaccess: "03", autopilot: "3" },
  showmax: { easyaccess: "04", autopilot: "4" },
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
    company: t.company,
    iucno: t.iucno,
    package: t.package,
    previous_balance: t.previous_balance,
    new_balance: t.new_balance,
  };
};

const verifyTVSub = async (req, res) => {
  try {
    const { cableType, smartCardNo } = req.body;

    if (!cableType || !smartCardNo) {
      return res
        .status(400)
        .json({ error: "cableType and smartCardNo are required" });
    }

    const result = await AutopilotService.validateSmartcard(
      cableType,
      smartCardNo
    );
    console.log(result);

    if (result.success) {
      return res.status(200).json(result.data);
    }

    return res.status(500).json({ error: result.error || "Unknown error" });
  } catch (err) {
    console.error("Error verifying smartcard:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
};

const purchaseTVSub = async (req, res) => {
  try {
    const result = await runInMongoTransaction(async (session) => {
      const authUserId = req.user?._id;
      const {
        provider,
        planId,
        customerName,
        smartCardNo,
        phone,
        paymentTypes = "FULL_PAYMENT",
        pinCode,
        networkId,
      } = req.body;

      if (!authUserId) throw httpError(401, "Not authorized");
      if (req.body.userId && String(req.body.userId) !== String(authUserId)) {
        throw httpError(403, "User mismatch");
      }

      const userId = authUserId;
      const user = await User.findById(userId).session(session);
      if (!user) throw httpError(404, "User not found");

      const plan = await ServicePlan.findById(planId)
        .populate("subServiceId")
        .session(session);
      if (!plan || !plan.active) {
        throw httpError(404, "Plan not found or inactive");
      }

      const basePrice = Number(plan.ourPrice);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        throw httpError(400, "Invalid plan pricing");
      }

      let effectiveTenantId = user.tenantId || null;
      let tenantOwnerUserId = null;
      let merchantFee = { enabled: false, amount: 0 };
      if (effectiveTenantId) {
        const tenant = await Tenant.findById(effectiveTenantId)
          .select("status ownerUserId billingSettings")
          .session(session);
        if (!tenant || tenant.status !== "active") {
          effectiveTenantId = null;
        } else {
          tenantOwnerUserId = tenant.ownerUserId || null;
          merchantFee = {
            enabled: tenant.billingSettings?.merchantFeeEnabled === true,
            amount: Number(tenant.billingSettings?.merchantFeeAmount || 0),
          };
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
        service: "cable_tv",
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

      const enabledApi = plan.subServiceId.provider;
      const previousBalance = user.balance;
      const debitResult = await deductFromVirtualAccount(
        userId,
        sellingPrice,
        session
      );

      let mappedCodes = null;
      if (networkId) {
        const networkKey = networkId.toLowerCase();
        mappedCodes = NETWORK_MAP[networkKey];
        if (!mappedCodes) {
          throw httpError(400, "Invalid network selected");
        }
      }

      let providerResult;
      if (enabledApi === "autopilot") {
        providerResult = await AutopilotService.payTVSubscription({
          cableType: provider,
          planId: plan.autopilotId,
          smartCardNo,
          customerName,
          phone,
          amount: basePrice,
          paymentTypes,
        });
      } else if (enabledApi === "easyaccess") {
        providerResult = await EasyAccessService.payTVSubscription({
          company: provider,
          iucno: smartCardNo,
          packageCode: plan.easyaccessId,
          amount: basePrice,
        });
      } else {
        throw httpError(400, "Invalid API provider. Use 'autopilot' or 'easyaccess'.");
      }

      const isFailure =
        !providerResult ||
        providerResult.success === false ||
        providerResult.status === false ||
        providerResult.data?.success === "false";

      const txnExtra = {
        userId,
        amount: sellingPrice,
        tenantId: effectiveTenantId,
        tenantOwnerUserId,
        platform_price: basePrice,
        selling_price: sellingPrice,
        merchant_profit: sellingPrice - basePrice,
        phone,
        network: mappedCodes?.[enabledApi],
        company: provider,
        iucno: smartCardNo,
        customer_name: customerName,
        provider: enabledApi,
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

      if (!isFailure && effectiveTenantId && tenantOwnerUserId && merchantFee.enabled && merchantFee.amount > 0) {
        const merchantFeeResult = await chargeMerchantTransactionFee({
          merchantUserId: tenantOwnerUserId,
          amount: merchantFee.amount,
          session,
        });
        txnExtra.merchant_fee_amount = merchantFeeResult?.amount ?? merchantFee.amount;
        txnExtra.merchant_fee_charged = merchantFeeResult?.charged === true;
        txnExtra.merchant_fee_deferred = merchantFeeResult?.deferred === true;
      }

      const transaction = await saveTransaction(
        {
          response: providerResult || {},
          serviceType: "cable_tv",
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
              message: "❌ TV Subscription purchase failed",
              transactionId: transaction?._id,
              request_id: transaction?._id,
              transaction: toTransactionSummary(transaction),
              error: providerResult?.error || "TV subscription failed",
              success: false,
            },
          }
        : {
            status: 200,
            body: {
              message: "✅ TV Subscription purchase successful",
              transactionId: transaction?._id,
              request_id: transaction?._id,
              transaction: toTransactionSummary(transaction),
              data: providerResult.data,
              success: true,
            },
          };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Error purchasing TV subscription:", err);
    const status = err?.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
    return res.status(status).json({ error: err.message || "Server error" });
  }
};

module.exports = {
  verifyTVSub,
  purchaseTVSub,
};
