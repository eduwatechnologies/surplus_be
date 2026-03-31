const Transaction = require("../models/transactionModel");

// ✅ Get all transactions
// async function getAllTransactions(req, res) {
//   try {
//     const transactions = await Transaction.find().populate("userId", "firstName email phone").sort({ createdAt: -1 });
//     res.status(200).json(transactions);
//   } catch (error) {
//     console.error("❌ Error fetching transactions:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// }

async function getAllTransactions(req, res) {
  try {
    // Parse query params (default: page=1, limit=100)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    // Fetch total number of transactions for pagination metadata
    const totalTransactions = await Transaction.countDocuments();

    // Fetch paginated transactions
    const transactions = await Transaction.find()
      .populate("userId", "firstName email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Return results with pagination info
    res.status(200).json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalTransactions / limit),
      totalTransactions,
      transactions,
    });
  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// ✅ Get a single transaction by request_id
async function getTransactionById(req, res) {
  try {
    const { _id } = req.params;
    const transaction = await Transaction.findById(_id);

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const userId = req.user?._id;
    const role = req.user?.role;
    const staffLikeRoles = ["superadmin", "admin", "manager", "support"];
    const canViewAny = role && staffLikeRoles.includes(role);

    if (!canViewAny && (!userId || String(transaction.userId) !== String(userId))) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json(transaction);
  } catch (error) {
    console.error("❌ Error fetching transaction:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// ✅ Get all transactions for a specific user (by phone number)
async function getUserTransactions(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No user ID provided" });
    }

    const transactions = await Transaction.find({ userId });

    // ✅ Always return transactions array, even if empty
    res.status(200).json({ transactions: transactions || [] });
  } catch (error) {
    console.error("❌ Error fetching user transactions:", error);
    res.status(500).json({
      message: "Internal Server Error!",
    });
  }
}

module.exports = {
  getAllTransactions,
  getTransactionById,
  getUserTransactions,
};
