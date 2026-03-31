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

    if (!authUserId) return res.status(401).json({ error: "Not authorized" });
    if (req.body.userId && String(req.body.userId) !== String(authUserId)) {
      return res.status(403).json({ error: "User mismatch" });
    }

    // 1. Validate user
    const userId = authUserId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 3. Get plan
    const plan = await ServicePlan.findById(planId).populate("subServiceId");
    if (!plan || !plan.active) {
      return res.status(404).json({ error: "Plan not found or inactive" });
    }

    const basePrice = Number(plan.ourPrice);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return res.status(400).json({ error: "Invalid plan pricing" });
    }

    let effectiveTenantId = user.tenantId || null;
    let tenantOwnerUserId = null;
    if (effectiveTenantId) {
      const tenant = await Tenant.findById(effectiveTenantId).select("status ownerUserId");
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
        }).select("pricingType value active")) ||
        (await TenantPlanPrice.findOne({
          tenantId: effectiveTenantId,
          userId: null,
          planId: plan._id,
          active: true,
        }).select("pricingType value active"));
    }

    const rawSellingPrice = computeSellingPrice(basePrice, override);
    const sellingPrice = rawSellingPrice === null ? null : Math.round(rawSellingPrice);
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      return res.status(400).json({ error: "Unable to compute selling price" });
    }

    const { pinRequired } = await enforceTenantRiskControls({ user, amount: sellingPrice, service: "cable_tv" });
    if (pinRequired || user.pinStatus) {
      if (!pinCode || typeof pinCode !== "string") {
        return res.status(400).json({ error: "Transaction PIN is required" });
      }
      if (!user.pinCode) {
        return res.status(400).json({ error: "Set your transaction PIN to continue" });
      }
      const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
      if (!isPinValid) {
        return res.status(401).json({ error: "Invalid transaction PIN" });
      }
    }

    const enabledApi = plan.subServiceId.provider;
    const previousBalance = user.balance;
    await deductFromVirtualAccount(userId, sellingPrice);

    // 4. Get mapped network (optional)
    let mappedCodes = null;
    if (networkId) {
      const networkKey = networkId.toLowerCase();
      mappedCodes = NETWORK_MAP[networkKey];
      if (!mappedCodes) {
        return res.status(400).json({ error: "Invalid network selected" });
      }
    }

    // 5. Call provider
    let result;
    if (enabledApi === "autopilot") {
      result = await AutopilotService.payTVSubscription({
        cableType: provider,
        planId: plan.autopilotId,
        smartCardNo,
        customerName,
        phone,
        amount: basePrice,
        paymentTypes,
      });
    } else if (enabledApi === "easyaccess") {
      result = await EasyAccessService.payTVSubscription({
        company: provider,
        iucno: smartCardNo,
        packageCode: plan.easyaccessId,
        amount: basePrice,
      });
    } else {
      return res.status(400).json({
        error: "Invalid API provider. Use 'autopilot' or 'easyaccess'.",
      });
    }

    let transaction;

    // 6. Check if failed
    const failed =
      !result ||
      result.success === false ||
      result.status === false ||
      result.data?.success === "false";

    if (failed) {
      await refundToVirtualAccount(userId, sellingPrice);
      transaction = await saveTransaction({
        response: result || {},
        serviceType: "cable_tv",
        status: "failed",
        extra: {
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
        },
        transaction_type: "debit",
        previous_balance: previousBalance,
        new_balance: previousBalance,
      });

      return res.status(400).json({
        message: "❌ TV Subscription purchase failed",
        transactionId: transaction._id,
        error: result?.error || "TV subscription failed",
      });
    }

    // 7. Success
    const updatedUser = await User.findById(userId);
    transaction = await saveTransaction({
      response: result || {},
      serviceType: "cable_tv",
      status: "success",
      extra: {
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
      },
      transaction_type: "debit",
      previous_balance: previousBalance,
      new_balance: updatedUser?.balance,
    });

    return res.status(200).json({
      message: "✅ TV Subscription purchase successful",
      transactionId: transaction._id,
      data: result.data,
    });
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
