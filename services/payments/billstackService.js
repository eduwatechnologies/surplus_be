const axios = require("axios");
require("dotenv").config();
const crypto = require("crypto");
const User = require("../../models/userModel");
const Transaction = require("../../models/transactionModel");
const {
  updateUserBalance,
  refundToVirtualAccount,
  deductFromVirtualAccount,
} = require("../../business_logic/billstackLogic");
const saveTransaction = require("../../utils/functions/saveTransaction");
const mongoose = require("mongoose");

const HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
};

const BillstackService = {
  /**
   * Generate Webhook Signature
   */
  generateSignature(secret) {
    return crypto.createHash("md5").update(secret).digest("hex");
  },

  /**
   * Create Virtual Account
   */
  async createVirtualAccount({
    user,
    email,
    reference,
    firstName,
    lastName,
    phone,
    bank,
  }) {
    try {
      const payload = {
        user,
        email,
        reference,
        firstName,
        lastName,
        phone,
        bank,
      };
      const response = await axios.post(
        `${process.env.BILLSTACK_BASE_URL}/generateVirtualAccount/`,
        payload,
        { headers: HEADERS }
      );

      return { success: true, data: response.data };
    } catch (error) {
      console.error(
        "Billstack Virtual Account Error:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || "Virtual Account request failed",
      };
    }
  },

  /**
   * Verify Payment
   */
  async verifyPayment(reference) {
    try {
      const response = await axios.get(
        `${process.env.BILLSTACK_API_BASE_URL}/verifyPayment/${reference}`,
        { headers: HEADERS }
      );

      return { success: true, data: response.data };
    } catch (error) {
      console.error(
        "Billstack Payment Verification Error:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || "Payment verification failed",
      };
    }
  },

  /**
   * Handle Incoming Webhooks
   */

  // async processWebhook(payload, signature) {
  //   try {
  //     // ✅ Validate Signature
  //     const validSignature = this.generateSignature(
  //       process.env.BILLSTACK_SECRET_KEY,
  //       payload
  //     );

  //     if (signature !== validSignature) {
  //       console.error("❌ Invalid Webhook Signature");
  //       return { success: false, message: "Unauthorized webhook" };
  //     }

  //     if (payload.event !== "PAYMENT_NOTIFICATION") {
  //       return { success: false, message: "Invalid event type" };
  //     }

  //     const { amount, reference, status } = payload.data;
  //     const accountNumber = payload.data.account?.account_number;

  //     if (!accountNumber) {
  //       return { success: false, message: "Account number missing" };
  //     }

  //     const user = await User.findOne({
  //       "account.accountNumber": String(accountNumber),
  //     });

  //     if (!user) {
  //       console.error("❌ User not found for account:", accountNumber);
  //       return { success: false, message: "User not found" };
  //     }

  //     // ✅ Prevent duplicate transactions
  //     const existingTx = await Transaction.findOne({ reference });
  //     if (existingTx) {
  //       console.log("⚠️ Duplicate webhook ignored:", reference);
  //       return { success: true, message: "Duplicate webhook ignored" };
  //     }

  //     // 💰 Handle debt first before adding to wallet
  //     let amountToWallet = amount;
  //     let amountUsedToClearDebt = 0;

  //     if (user.owning > 0) {
  //       // Determine how much to clear
  //       const amountToClear = Math.min(user.owning, amount);
  //       amountUsedToClearDebt = amountToClear;
  //       amountToWallet = amount - amountToClear;

  //       // Update both owning and balance atomically
  //       await User.findOneAndUpdate(
  //         { _id: user._id },
  //         {
  //           $inc: {
  //             owning: -amountToClear, // reduce debt
  //             balance: amountToWallet, // add remaining to wallet
  //           },
  //         },
  //         { new: true }
  //       );
  //     } else {
  //       // No debt → all goes to balance
  //       await User.findOneAndUpdate(
  //         { _id: user._id },
  //         { $inc: { balance: amount } },
  //         { new: true }
  //       );
  //     }

  //     // ✅ Save transaction record
  //     await saveTransaction({
  //       reference,
  //       response: payload,
  //       serviceType: "wallet",
  //       status: status || "success",
  //       previous_balance: user.balance,
  //       new_balance: user.balance + amountToWallet,
  //       extra: {
  //         userId: user._id,
  //         amount: amount,
  //         transaction_type: "credit",
  //         note:
  //           amountUsedToClearDebt > 0
  //             ? `₦${amountUsedToClearDebt} used to clear debt. ₦${amountToWallet} added to wallet.`
  //             : `Wallet funding via Billstack. Reference: ${reference}`,
  //       },
  //     });

  //     return { success: true, message: "Webhook processed successfully" };
  //   } catch (error) {
  //     console.error("❌ Webhook processing error:", error);
  //     return { success: false, message: "Internal server error!" };
  //   }
  // },

  async processWebhook(payload, signature) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1️⃣ Validate Webhook Signature
      const validSignature = this.generateSignature(
        process.env.BILLSTACK_SECRET_KEY
      );
      if (signature !== validSignature) {
        console.error("❌ Invalid Webhook Signature");
        await session.abortTransaction();
        session.endSession();
        return { success: false, message: "Unauthorized webhook" };
      }

      // 2️⃣ Validate Event Type
      if (payload.event !== "PAYMENT_NOTIFICATION") {
        await session.abortTransaction();
        session.endSession();
        return { success: false, message: "Invalid event type" };
      }

      // 3️⃣ Extract Data
      const { amount, transaction_ref, reference } = payload.data;
      const accountNumber = payload.data.account?.account_number;

      if (!accountNumber) {
        await session.abortTransaction();
        session.endSession();
        return { success: false, message: "Account number missing" };
      }

      // 4️⃣ Find User
      const user = await User.findOne({
        "account.accountNumber": String(accountNumber),
      }).session(session);

      if (!user) {
        console.error("❌ User not found for account:", accountNumber);
        await session.abortTransaction();
        session.endSession();
        return { success: false, message: "User not found" };
      }

      // 5️⃣ Prevent True Duplicates (skip successful ones)
      const existingTxn = await Transaction.findOne({
        provider_reference: transaction_ref,
      }).session(session);

      if (existingTxn) {
        if (existingTxn.status === "success") {
          console.warn(
            `⚠️ Duplicate successful webhook for ref ${transaction_ref}. Ignoring.`
          );
          await session.abortTransaction();
          session.endSession();
          return { success: false, message: "Duplicate transaction ignored" };
        } else {
          console.warn(
            `🔁 Retrying previously failed transaction for ref ${transaction_ref}.`
          );
          // continue processing
        }
      }

      // 6️⃣ Prepare Funding
      const totalAmount = parseFloat(amount) || 0;
      const previousBalance = user.balance || 0;
      const newBalance = previousBalance + totalAmount;

      // 7️⃣ Update User Balance
      const isUpdated = await updateUserBalance(user, totalAmount, session);
      if (!isUpdated) {
        console.error(`❌ Failed to update balance for ${user.email}`);
        await session.abortTransaction();
        session.endSession();
        return { success: false, message: "Balance update failed" };
      }

      // 8️⃣ Save Wallet Transaction
      await saveTransaction({
        response: payload,
        serviceType: "wallet",
        status: "success",
        previous_balance: previousBalance,
        new_balance: newBalance,
        extra: {
          userId: user._id,
          amount: totalAmount,
          transaction_type: "credit",
          provider_reference: transaction_ref, // ✅ unique reference
          reference,
          note: `Wallet funding via Billstack. Ref: ${transaction_ref}`,
        },
      });

      // 9️⃣ Commit Transaction
      await session.commitTransaction();
      session.endSession();

      console.log(
        `✅ Wallet funded successfully for ${user.email}. Ref: ${transaction_ref}`
      );
      return { success: true, message: "Webhook processed successfully" };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("❌ Webhook processing error:", error);
      return { success: false, message: "Internal server error" };
    }
  },

  async RefundUser({ userId, amount }) {
    try {
      // refundToVirtualAccount will now return balances along with user
      const { user, previous_balance, new_balance } =
        await refundToVirtualAccount(userId, amount);

      // Save transaction with correct balances
      await saveTransaction({
        serviceType: "wallet",
        status: "success",
        previous_balance,
        new_balance,
        extra: {
          userId,
          amount,
          transaction_type: "credit", // schema expects "credit" for money in
          note: "Admin initiated refund",
        },
      });

      return { success: true, user, previous_balance, new_balance };
    } catch (error) {
      console.error("Refund failed:", error.message);
      throw error;
    }
  },

  async DefundUser({ userId, amount }) {
    try {
      // Step 1: Deduct balance from user’s virtual wallet
      const { user, previous_balance, new_balance } =
        await deductFromVirtualAccount(userId, amount);

      // Step 2: Log the transaction
      await saveTransaction({
        serviceType: "wallet",
        status: "success",
        previous_balance,
        new_balance,
        extra: {
          userId,
          amount,
          transaction_type: "debit", // ✅ for money going out
          note: "Admin initiated deduction",
        },
      });

      // return { success: true, message: "Deduction processed successfully" };
      return { success: true, user, previous_balance, new_balance };
    } catch (error) {
      console.error("❌ DeduceUser error:", error.message);
      return { success: false, message: "Internal server error!" };
    }
  },
};

module.exports = BillstackService;
