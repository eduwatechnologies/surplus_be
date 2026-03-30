const mongoose = require("mongoose");
const AutopilotService = require("../../providers/autopilot");
const saveTransaction = require("../../utils/functions/saveTransaction");
const User = require("../../models/userModel");
const bcrypt = require("bcryptjs");
const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
} = require("../../business_logic/billstackLogic");
const NETWORK_PREFIXES = require("../../utils/constant/networkPrefix");
const calculateDiscount = require("../../utils/functions/calculateDiscount");

const NETWORK_MAP = {
  mtn: { autopilot: "1" },
  airtel: { autopilot: "2" },
  glo: { autopilot: "3" },
  "9mobile": { autopilot: "4" },
};

const purchaseAirtime = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId, phone, amount, userId, pinCode, networkId, airtimeType } =
      req.body;

    // 1. Validate user
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ error: "User not found" });
    }

    // 2. Validate transaction pin
    if (user.pinStatus) {
      const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
      if (!isPinValid) {
        await session.abortTransaction();
        return res.status(401).json({ error: "Invalid transaction PIN" });
      }
    }

    // 3. Validate phone prefix
    const phonePrefix4 = phone.substring(0, 4);
    const phonePrefix5 = phone.substring(0, 5);
    const validPrefixes = NETWORK_PREFIXES[networkId.toLowerCase()];
    if (
      !validPrefixes ||
      (!validPrefixes.includes(phonePrefix4) &&
        !validPrefixes.includes(phonePrefix5))
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        error: `❌ Phone number ${phone} does not match ${networkId.toUpperCase()} network.`,
      });
    }

    const previousBalance = user.balance;
    const discountedAmount = calculateDiscount(amount, "percentage", 2);

    // 4. Deduct wallet inside transaction
    await deductFromVirtualAccount(userId, discountedAmount, session);

    // 5. Call provider
    const networkKey = networkId.toLowerCase();
    const mappedCodes = NETWORK_MAP[networkKey];
    if (!mappedCodes) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Invalid network selected" });
    }

    const result = await AutopilotService.purchaseAirtime({
      networkId: mappedCodes.autopilot,
      phone,
      amount,
      airtimeType: airtimeType || "VTU",
    });

    // 6. Handle provider failure
    if (
      !result ||
      result.success === false ||
      result.data?.success === "false" ||
      result.status === false
    ) {
      const transaction = await saveTransaction(
        {
          response: result || {},
          serviceType: "airtime",
          status: "failed",
          extra: {
            userId,
            amount: discountedAmount,
            phone,
            network: networkId,
          },
          transaction_type: "debit",
          previous_balance: previousBalance,
          new_balance: previousBalance,
        },
        { session }
      );

      await refundToVirtualAccount(userId, discountedAmount, session);

      await session.commitTransaction();
      session.endSession();

      return res.status(400).json({
        message: "❌ Airtime purchase failed",
        transactionId: transaction._id,
        error: result?.error || "Unknown error from provider",
      });
    }

    // 7. Save success transaction
    const updatedUser = await User.findById(userId).session(session);
    const transaction = await saveTransaction(
      {
        response: result,
        serviceType: "airtime",
        status: "success",
        extra: { userId, amount: discountedAmount, phone, network: networkId },
        transaction_type: "credit",
        previous_balance: previousBalance,
        new_balance: updatedUser.balance,
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "✅ Airtime purchased successfully",
      transactionId: transaction._id,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("❌ Error purchasing airtime:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message || "An unexpected error occurred",
    });
  }
};

module.exports = {
  purchaseAirtime,
};
