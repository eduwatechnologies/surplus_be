const User = require("../models/userModel");
const Tenant = require("../models/tenantModel");
const Transaction = require("../models/transactionModel");
const mongoose = require("mongoose");

const checkBalance = async (userId) => {
  const user = await User.findById(userId);
  return user?.balance || 0;
};

// const deductFromVirtualAccount = async (userId, amount) => {
//   try {
//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       throw new Error("Invalid user ID format");
//     }

//     // Ensure amount is a valid number
//     const numericAmount = Number(amount);
//     if (isNaN(numericAmount) || numericAmount <= 0) {
//       throw new Error("Invalid amount specified");
//     }

//     // Fetch user with balance field only to optimize performance
//     const user = await User.findById(userId).select("balance");

//     if (!user) {
//       throw new Error("User account not found");
//     }

//     // Ensure balance is a number
//     user.balance = Number(user.balance) || 0;

//     if (user.balance < numericAmount) {
//       throw new Error("Insufficient balance");
//     }

//     const previous_balance = user.balance; // capture old balance
//     const new_balance = previous_balance - numericAmount; // ✅ subtract

//     // Deduct and save
//     user.balance = new_balance;
//     await user.save();

//     console.log(
//       `✅ Deducted ${numericAmount} from user ${userId}. Previous: ${previous_balance}, New balance: ${new_balance}`
//     );

//     return { userId, previous_balance, new_balance };
//   } catch (error) {
//     console.error("❌ Error in deductFromVirtualAccount:", error.message);
//     throw error;
//   }
// };

const deductFromVirtualAccount = async (userId, amount, session = null) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID format");
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error("Invalid amount specified");
    }

    const query = {
      _id: userId,
      balance: { $gte: numericAmount }, // prevent overdraft
    };

    const update = {
      $inc: { balance: -numericAmount },
    };

    const options = {
      new: true,
      session, // ✅ attach session if provided
    };

    const updatedUser = await User.findOneAndUpdate(
      query,
      update,
      options
    ).select("balance");

    if (!updatedUser) {
      throw new Error("Insufficient balance");
    }

    console.log(
      `✅ Deducted ${numericAmount} from user ${userId}. New balance: ${updatedUser.balance}`
    );

    return {
      userId,
      new_balance: updatedUser.balance,
    };
  } catch (error) {
    console.error("❌ Error in deductFromVirtualAccount:", error.message);
    throw error;
  }
};

const refundToVirtualAccount = async (userId, amount, session = null) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid or missing user ID");
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error("Invalid amount for refund");
  }

  const user = await User.findById(userId).session(session);
  if (!user) {
    throw new Error("User not found for refund");
  }

  const previous_balance = user.balance;
  const new_balance = previous_balance + numericAmount;

  user.balance = new_balance;
  await user.save({ session });

  // ✅ Log transaction properly
  // await saveTransaction(
  //   {
  //     response: { message: "Refund successful" },
  //     serviceType: "refund",
  //     status: "success",
  //     extra: { userId, amount: numericAmount },
  //     transaction_type: "refund",
  //     previous_balance,
  //     new_balance,
  //   },
  //   { session }
  // );

  console.log(
    `🔄 Refunded ₦${numericAmount} to user ${userId}. Previous balance: ₦${previous_balance}, New balance: ₦${new_balance}`
  );

  return { user, previous_balance, new_balance };
};

const updateUserBalance = async (user, amount) => {
  try {
    const amountToAdd = parseFloat(amount) || 0;
    console.log(`🔹 Amount to add: ₦${amountToAdd}`);
    console.log(`🔹 Current balance before update: ₦${user.balance}`);

    if (typeof user.balance !== "number") {
      console.error("❌ Balance is not a number! Resetting to 0.");
      user.balance = 0; // Prevent errors if balance is undefined or string
    }

    user.balance += amountToAdd;
    console.log(`✅ New balance after update: ₦${user.balance}`);

    await user.save(); // Ensure user is saved after update
    console.log(`✅ Balance successfully saved for ${user.email}`);

    return true;
  } catch (error) {
    console.error("❌ Error updating balance:", error);
    return false;
  }
};

const enforceTenantRiskControls = async ({ user, amount, service = null, session = null }) => {
  const tenantId = user?.tenantId || null;
  if (!tenantId) return { pinRequired: false, tenant: null };

  const tenant = await Tenant.findOne({ _id: tenantId, status: "active" })
    .select("riskSettings disabledServices")
    .lean();
  if (!tenant) return { pinRequired: false, tenant: null };

  if (service) {
    const key = String(service || "").trim().toLowerCase();
    const disabled = Array.isArray(tenant.disabledServices) ? tenant.disabledServices : [];
    if (disabled.map((s) => String(s).toLowerCase()).includes(key)) {
      const e = new Error("This service is currently unavailable");
      e.statusCode = 403;
      throw e;
    }
  }

  const risk = tenant.riskSettings || {};
  const pinRequired = risk?.pinRequired === true;

  const charge = Number(amount);
  if (!Number.isFinite(charge) || charge < 0) {
    const e = new Error("Invalid amount");
    e.statusCode = 400;
    throw e;
  }

  const windowMinutes = Number(risk.velocityWindowMinutes);
  const maxTx = Number(risk.velocityMaxTx);
  if (Number.isFinite(windowMinutes) && Number.isFinite(maxTx) && windowMinutes > 0 && maxTx > 0) {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    let recentCountQuery = Transaction.countDocuments({
      userId: user._id,
      createdAt: { $gte: windowStart },
    });
    if (session) recentCountQuery = recentCountQuery.session(session);
    const recentCount = await recentCountQuery;
    if (recentCount >= maxTx) {
      const e = new Error("Too many requests. Please try again shortly.");
      e.statusCode = 429;
      throw e;
    }
  }

  const kycVerified = String(user?.kycStatus || "").toLowerCase() === "verified";
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  let totalsAgg = Transaction.aggregate([
    {
      $match: {
        userId: user._id,
        status: "success",
        createdAt: { $gte: dayStart },
        service: { $in: ["airtime", "data", "electricity", "cable_tv", "exam_pin"] },
      },
    },
    { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $ifNull: ["$amount", 0] } } } },
  ]);
  if (session) totalsAgg = totalsAgg.session(session);
  const totals = await totalsAgg;

  const usedCount = totals[0]?.count || 0;
  const usedAmount = totals[0]?.amount || 0;

  const amountLimit = kycVerified ? risk.dailyAmountLimitVerified : risk.dailyAmountLimitUnverified;
  const txLimit = kycVerified ? risk.dailyTxLimitVerified : risk.dailyTxLimitUnverified;

  if (typeof txLimit === "number" && Number.isFinite(txLimit) && txLimit >= 0) {
    if (usedCount + 1 > txLimit) {
      const e = new Error("Daily transaction limit reached");
      e.statusCode = 403;
      throw e;
    }
  }
  if (typeof amountLimit === "number" && Number.isFinite(amountLimit) && amountLimit >= 0) {
    if (usedAmount + charge > amountLimit) {
      const e = new Error("Daily amount limit reached");
      e.statusCode = 403;
      throw e;
    }
  }

  if (typeof risk.kycRequiredAbove === "number" && Number.isFinite(risk.kycRequiredAbove) && risk.kycRequiredAbove >= 0) {
    if (!kycVerified && charge > risk.kycRequiredAbove) {
      const e = new Error("KYC required for this transaction amount");
      e.statusCode = 403;
      throw e;
    }
  }

  return { pinRequired, tenant };
};

module.exports = {
  checkBalance,
  deductFromVirtualAccount,
  refundToVirtualAccount,
  updateUserBalance,
  enforceTenantRiskControls,
};
