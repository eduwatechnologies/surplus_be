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

const purchaseData = async (req, res) => {
  try {
    const authUserId = req.user?._id;
    const { phone, userId: bodyUserId, pinCode, planId, networkId } = req.body;
    if (!authUserId) return res.status(401).json({ error: "Not authorized" });
    if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
      return res.status(403).json({ error: "User mismatch" });
    }

    if (!phone || !planId || !networkId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ✅ Check network prefix (4 or 5 digits)
    const phonePrefix4 = phone.substring(0, 4);
    const phonePrefix5 = phone.substring(0, 5);
    const validPrefixes = NETWORK_PREFIXES[networkId.toLowerCase()];
    if (
      !validPrefixes ||
      (!validPrefixes.includes(phonePrefix4) &&
        !validPrefixes.includes(phonePrefix5))
    ) {
      return res.status(400).json({
        error: `❌ Phone number ${phone} does not match ${networkId.toUpperCase()} network.`,
      });
    }

    const userId = authUserId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const plan = await ServicePlan.findById(planId).populate("subServiceId");
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    let detectedDataType = getDataTypeFromPlanId(plan.autopilotId);

    const normalizedCategory = String(plan.category || "").toUpperCase().trim();
    const categoryProvider = await CategoryProvider.findOne({
      subServiceId: plan.subServiceId?._id,
      network: String(networkId || "").toUpperCase().trim(),
      category: normalizedCategory,
    });

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

    const { pinRequired } = await enforceTenantRiskControls({ user, amount: sellingPrice, service: "data" });
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

    if (!categoryProvider || categoryProvider.status === false) {
      return res
        .status(400)
        .json({ error: "This category is currently unavailable" });
    }

    const enabledApi = categoryProvider.provider;
    const previousBalance = user?.balance;

    await deductFromVirtualAccount(userId, sellingPrice);

    const networkKey = networkId.toLowerCase();
    const mappedCodes = NETWORK_MAP[networkKey];
    if (!mappedCodes) {
      return res.status(400).json({ error: "Invalid network selected" });
    }

    let result;

    if (enabledApi === "autopilot") {
      result = await AutopilotService.purchaseData({
        networkId: mappedCodes.autopilot,
        dataType: detectedDataType,
        planId: plan.autopilotId,
        phone,
      });
    } else if (enabledApi === "easyaccess") {
      result = await EasyAccessService.purchaseData({
        network: mappedCodes.easyaccess,
        dataplan: plan.easyaccessId,
        phone,
      });
    } else {
      return res
        .status(400)
        .json({ error: "No enabled provider for this sub-service" });
    }

    // ❌ FAILURE CONDITION
    if (
      !result ||
      result.success === false ||
      result.data?.success === false ||
      result.data?.success === "false" ||
      result.data?.success === "false_disabled" ||
      result.data?.code === 201 ||
      result.status === false
    ) {
      const failedTxn = await saveTransaction({
        response: result || {},
        serviceType: "data",
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
          network: networkId,
          dataplan: plan?.name || "",
        },
        transaction_type: "debit",
        previous_balance: previousBalance,
        new_balance: previousBalance,
      });

      await refundToVirtualAccount(userId, sellingPrice);

      return res.status(400).json({
        error:
          result?.data?.message ||
          result?.error ||
          "Unknown error from provider",
        transactionId: failedTxn?._id,
      });
    }

    // ✅ SUCCESS
    const refundedUser = await User.findById(userId);

    const savedTxn = await saveTransaction({
      response: result,
      serviceType: "data",
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
        network: networkId,
        dataplan: plan?.name || "",
        client_reference: result?.data?.client_reference,
      },
      transaction_type: "debit",
      previous_balance: previousBalance,
      new_balance: refundedUser.balance,
    });

    return res.status(200).json({
      message: "✅ Data bundle purchased successfully",
      transactionId: savedTxn?._id,
    });
  } catch (error) {
    console.error("❌ Error purchasing data:", error);
    const status = error?.statusCode && Number.isFinite(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({ error: error.message || "An unexpected error occurred" });
  }
};

module.exports = {
  purchaseData,
};
