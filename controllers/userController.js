const User = require("../models/userModel");
const logger = require("../utils/logger");
const Transaction = require("../models/transactionModel");
const {
  createVirtualAccountForUser,
} = require("../business_logic/accountLogic");
const saveTransaction = require("../utils/functions/saveTransaction");

require("dotenv").config();

// Update profile
const updateProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    logger.info("Profile update attempt", { userId });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Create or update the virtual account
    const virtualAccount = await createVirtualAccountForUser(user);

    if (virtualAccount) {
      // Check if this virtual account already exists
      const existingAccountIndex = user.account.findIndex(
        (acc) => acc.virtualAccountId === virtualAccount.virtualAccountId
      );

      if (existingAccountIndex >= 0) {
        // Update existing account
        user.account[existingAccountIndex] = {
          bankName: virtualAccount.bankName,
          accountNumber: virtualAccount.accountNumber,
          accountName: virtualAccount.accountName,
          virtualAccountId: virtualAccount.virtualAccountId,
        };
      } else {
        // Add new account if it doesn't exist
        user.account.push({
          bankName: virtualAccount.bankName,
          accountNumber: virtualAccount.accountNumber,
          accountName: virtualAccount.accountName,
          virtualAccountId: virtualAccount.virtualAccountId,
        });
      }
    }

    await user.save();

    logger.info("Profile updated successfully", { userId });
    res.status(200).json({
      msg: "Profile updated successfully",
    });
  } catch (error) {
    logger.error("Profile update error", { error: error.message, userId });
    res.status(500).send(error.message || "Internal Server Error");
  }
};

// Current User
const CurrentUser = async (req, res) => {
  const userId = req.user.id; // from your auth middleware

  try {
    const user = await User.findById(userId).select(
      " firstName lastName email phone isVerified balance bonus referralCode pinStatus account"
    );

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("Fetch current user error", error);
    res.status(500).json({ err: "Server error", error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const user = await User.find().sort({ createdAt: -1 });
    res.status(200).json(user);
  } catch (error) {
    logger.error("Fetch current user error", { error });
    res.status(500).json({ err: "Server error", error: error.message });
  }
};

const getUserProfile = async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    const grouped = {
      airtime: transactions.filter(
        (t) => t.service?.toLowerCase() === "airtime"
      ),
      data: transactions.filter((t) => t.service?.toLowerCase() === "data"),
      electricity: transactions.filter(
        (t) => t.service?.toLowerCase() === "electricity"
      ),
      wallet: transactions.filter((t) => t.service?.toLowerCase() === "wallet"),
      wallet: transactions.filter(
        (t) => t.service?.toLowerCase() === "cable_tv"
      ),
      others: transactions.filter(
        (t) =>
          !["airtime", "data", "electricity", "cable_tv", "wallet"].includes(
            t.service?.toLowerCase()
          )
      ),
    };

    res.status(200).json({ user, transactions: grouped });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

const addUserOwing = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({
        success: false,
        message: "User ID and amount are required.",
      });
    }

    // ✅ Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // ✅ Increase owing (debt)
    user.owning += Number(amount);
    await user.save();

    // ✅ Log the debt transaction
    await saveTransaction({
      reference: `DEBT-${Date.now()}`,
      response: {},
      serviceType: "debt",
      status: "success",
      previous_balance: user.balance,
      new_balance: user.balance,
      extra: {
        userId: user._id,
        amount,
        transaction_type: "debit",
        note: `₦${amount} added to user's owing (debt).`,
      },
    });

    res.status(200).json({
      success: true,
      message: `₦${amount} added to user's owing successfully.`,
      data: {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        currentOwing: user.owning,
      },
    });
  } catch (error) {
    console.error("❌ Error adding user owing:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

module.exports = {
  updateProfile,
  getUserProfile,
  CurrentUser,
  getAllUsers,
  addUserOwing,
};
