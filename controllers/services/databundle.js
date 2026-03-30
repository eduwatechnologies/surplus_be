const saveTransaction = require("../../utils/functions/saveTransaction");
const EasyAccessService = require("../../providers/easyAccess");
const AutopilotService = require("../../providers/autopilot");
const ServicePlan = require("../../models/servicePlanModel");
const User = require("../../models/userModel");
const bcrypt = require("bcryptjs");

const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
} = require("../../business_logic/billstackLogic");
const getDataTypeFromPlanId = require("../../utils/functions/dataTypeFormatter");
const CategoryProvider = require("../../models/testingCategoryProviderModel");
const NETWORK_PREFIXES = require("../../utils/constant/networkPrefix");

const NETWORK_MAP = {
  // Airtime/Data
  mtn: { easyaccess: "01", autopilot: "1" },
  airtel: { easyaccess: "03", autopilot: "2" },
  glo: { easyaccess: "02", autopilot: "3" },
  "9mobile": { easyaccess: "04", autopilot: "4" },
};

const purchaseData = async (req, res) => {
  try {
    const { phone, userId, pinCode, planId, networkId, amount } = req.body;
    console.log(req.body);

    if (!phone || !userId || !planId || !networkId) {
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

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.pinStatus) {
      const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
      if (!isPinValid) {
        return res.status(401).json({ error: "Invalid transaction PIN" });
      }
    }

    const plan = await ServicePlan.findById(planId).populate("subServiceId");
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    let detectedDataType = getDataTypeFromPlanId(plan.autopilotId);

    const categoryProvider = await CategoryProvider.findOne({
      network: networkId.toUpperCase(),
      category: plan.category,
    });

    if (Number(amount) !== Number(plan.ourPrice)) {
      return res
        .status(400)
        .json({ error: "Amount mismatch. Please use plan price." });
    }

    if (!categoryProvider || categoryProvider.status === false) {
      return res
        .status(400)
        .json({ error: "This category is currently unavailable" });
    }

    const enabledApi = categoryProvider.provider;
    const previousBalance = user?.balance;

    await deductFromVirtualAccount(userId, plan.ourPrice);

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
          amount: plan.ourPrice,
          phone,
          network: networkId,
          dataplan: plan?.name || "",
        },
        transaction_type: "debit",
        previous_balance: previousBalance,
        new_balance: previousBalance,
      });

      await refundToVirtualAccount(userId, amount);

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
        amount: plan.ourPrice,
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
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message || "An unexpected error occurred",
    });
  }
};

module.exports = {
  purchaseData,
};
