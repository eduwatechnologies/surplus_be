const mongoose = require("mongoose");
const AutopilotService = require("../../providers/autopilot");
const saveTransaction = require("../../utils/functions/saveTransaction");
const User = require("../../models/userModel");
const Tenant = require("../../models/tenantModel");
const bcrypt = require("bcryptjs");
const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
  enforceTenantRiskControls,
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
    const authUserId = req.user?._id;
    const { planId, phone, amount, userId: bodyUserId, pinCode, networkId, airtimeType } =
      req.body;

    if (!authUserId) {
      await session.abortTransaction();
      return res.status(401).json({ error: "Not authorized" });
    }
    if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
      await session.abortTransaction();
      return res.status(403).json({ error: "User mismatch" });
    }

    if (!phone || !amount || !networkId) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Validate user
    const userId = authUserId;
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ error: "User not found" });
    }

    let effectiveTenantId = user.tenantId || null;
    let tenantOwnerUserId = null;
    if (effectiveTenantId) {
      const t = await Tenant.findById(effectiveTenantId).select("status ownerUserId").session(session);
      if (!t || t.status !== "active") {
        effectiveTenantId = null;
      } else {
        tenantOwnerUserId = t.ownerUserId || null;
      }
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Invalid amount" });
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
    const discountedAmount = calculateDiscount(parsedAmount, "percentage", 2);

    const { pinRequired } = await enforceTenantRiskControls({
      user,
      amount: discountedAmount,
      service: "airtime",
      session,
    });

    if (pinRequired || user.pinStatus) {
      if (!pinCode || typeof pinCode !== "string") {
        await session.abortTransaction();
        return res.status(400).json({ error: "Transaction PIN is required" });
      }
      if (!user.pinCode) {
        await session.abortTransaction();
        return res.status(400).json({ error: "Set your transaction PIN to continue" });
      }
      const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
      if (!isPinValid) {
        await session.abortTransaction();
        return res.status(401).json({ error: "Invalid transaction PIN" });
      }
    }

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
            tenantId: effectiveTenantId,
            tenantOwnerUserId,
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
        extra: { userId, tenantId: effectiveTenantId, tenantOwnerUserId, amount: discountedAmount, phone, network: networkId },
        transaction_type: "debit",
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
    const status = error?.statusCode && Number.isFinite(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({ error: error.message || "An unexpected error occurred" });
  }
};

module.exports = {
  purchaseAirtime,
};
