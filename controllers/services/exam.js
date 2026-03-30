const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../../models/userModel");
const servicePlanModel = require("../../models/servicePlanModel");
const saveTransaction = require("../../utils/functions/saveTransaction");
const EasyAccessService = require("../../providers/easyAccess");

const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
} = require("../../business_logic/billstackLogic");

const ALLOWED_PIN_COUNTS = [1, 2, 3, 4, 5, 10];

const purchaseExamPin = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { noOfPin, userId, pinCode, planId } = req.body;

    // 1️⃣ Validate required fields
    if (!noOfPin || !planId || !userId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Missing required fields: 'noOfPin', 'planId', 'userId'",
      });
    }

    // 2️⃣ Validate allowed pin count
    if (!ALLOWED_PIN_COUNTS.includes(Number(noOfPin))) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid number of pins. Allowed values: 1, 2, 3, 4, 5, 10",
      });
    }

    // 3️⃣ Validate user
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // // 4️⃣ Verify transaction PIN (if enabled)
    if (user.pinStatus) {
      const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
      if (!isPinValid) {
        await session.abortTransaction();
        return res.status(401).json({
          success: false,
          message: "Invalid transaction PIN",
        });
      }
    }

    // 5️⃣ Fetch plan from DB (with populated subService)
    const plan = await servicePlanModel
      .findById(planId)
      .populate("subServiceId")
      .session(session);

    if (!plan || !plan.active) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Selected plan not found or inactive",
      });
    }

    const ourPrice = plan.ourPrice;
    const totalCost = ourPrice * Number(noOfPin);
    const previousBalance = user.balance;

    // 6️⃣ Check wallet balance
    if (user.balance < totalCost) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. You need at least ₦${totalCost}`,
      });
    }

    // 7️⃣ Deduct from wallet
    await deductFromVirtualAccount(userId, totalCost, session);

    const enabledApi = plan.provider; // e.g. "easyaccess"
    let result;

    // 8️⃣ Call API provider
    if (enabledApi === "easyaccess") {
      result = await EasyAccessService.purchaseExamPin({
        no_of_pins: noOfPin,
        type: plan.category, // WAEC, NECO etc.
        // exam_id: plan.easyaccessId, // provider’s internal id
      });
    } else {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid provider configured for this plan",
      });
    }

    // 9️⃣ Handle failed provider response
    const isSuccess =
      result?.success === true ||
      result?.status === true ||
      result?.data?.success === true;

    if (!isSuccess) {
      // refund user immediately
      await refundToVirtualAccount(userId, totalCost, session);

      const failedTx = await saveTransaction({
        response: result || {},
        serviceType: "exam_pin",
        status: "failed",
        extra: {
          userId,
          planId,
          noOfPin,
          amount: totalCost,
          provider: enabledApi,
        },
        previous_balance: previousBalance,
        new_balance: previousBalance,
      });

      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message:
          result?.data?.message || result?.error || "Exam pin purchase failed",
        transactionId: failedTx._id,
      });
    }

    // 🔟 If successful, finalize and log transaction
    const updatedUser = await User.findById(userId).session(session);

    const successTx = await saveTransaction({
      response: result || {},
      serviceType: "exam_pin",
      status: "success",
      extra: {
        userId,
        planId,
        noOfPin,
        amount: totalCost,
        provider: enabledApi,
      },
      previous_balance: previousBalance,
      new_balance: updatedUser.balance,
    });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "✅ Exam pin purchase successful",
      data: result.data,
      transactionId: successTx._id,
    });
  } catch (error) {
    console.error("Error purchasing exam pin:", error);
    await session.abortTransaction();
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  } finally {
    session.endSession();
  }
};

module.exports = { purchaseExamPin };
