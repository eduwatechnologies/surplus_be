const User = require("../models/userModel");
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

module.exports = {
  checkBalance,
  deductFromVirtualAccount,
  refundToVirtualAccount,
  updateUserBalance,
};
