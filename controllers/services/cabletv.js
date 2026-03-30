const EasyAccessService = require("../../providers/easyAccess");
const AutopilotService = require("../../providers/autopilot");
const User = require("../../models/userModel");
const bcrypt = require("bcryptjs");
const ServicePlan = require("../../models/servicePlanModel");
const saveTransaction = require("../../utils/functions/saveTransaction");

const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
} = require("../../business_logic/billstackLogic");
const NETWORK_MAP = {
  dstv: { easyaccess: "01", autopilot: "1" },
  gotv: { easyaccess: "02", autopilot: "2" },
  startimes: { easyaccess: "03", autopilot: "3" },
  showmax: { easyaccess: "04", autopilot: "4" },
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
    const {
      userId,
      provider,
      planId,
      customerName,
      smartCardNo,
      phone,
      amount,
      paymentTypes = "FULL_PAYMENT",
      pinCode,
      networkId,
    } = req.body;

    // 1. Validate user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 2. Verify PIN
    // if (user.pinStatus) {
    //   const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
    //   if (!isPinValid) {
    //     return res.status(401).json({ error: "Invalid transaction PIN" });
    //   }
    // }

    // 3. Get plan
    const plan = await ServicePlan.findById(planId).populate("subServiceId");
    if (!plan || !plan.active) {
      return res.status(404).json({ error: "Plan not found or inactive" });
    }

    const enabledApi = plan.subServiceId.provider;
    await deductFromVirtualAccount(userId, amount);

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
        amount,
        paymentTypes,
      });
    } else if (enabledApi === "easyaccess") {
      result = await EasyAccessService.payTVSubscription({
        company: provider,
        iucno: smartCardNo,
        packageCode: plan.easyaccessId,
        amount,
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
      await refundToVirtualAccount(userId, amount);
      transaction = await saveTransaction({
        response: result || {},
        serviceType: "cable_tv",
        status: "failed",
        extra: {
          userId,
          amount,
          phone,
          network: mappedCodes?.[enabledApi],
          company: provider,
          iucno: smartCardNo,
          customer_name: customerName,
          provider: enabledApi,
        },
      });

      return res.status(400).json({
        message: "❌ TV Subscription purchase failed",
        transactionId: transaction._id,
        error: result?.error || "TV subscription failed",
      });
    }

    // 7. Success
    transaction = await saveTransaction({
      response: result || {},
      serviceType: "cable_tv",
      status: "SUCCESS",
      extra: {
        userId,
        amount,
        phone,
        network: mappedCodes?.[enabledApi],
        company: provider,
        iucno: smartCardNo,
        customer_name: customerName,
        provider: enabledApi,
      },
    });

    return res.status(200).json({
      message: "✅ TV Subscription purchase successful",
      transactionId: transaction._id,
      data: result.data,
    });
  } catch (err) {
    console.error("Error purchasing TV subscription:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  verifyTVSub,
  purchaseTVSub,
};
