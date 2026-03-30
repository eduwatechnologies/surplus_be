const express = require("express");
const {
  getAllTransactions,
  getTransactionById,
  getUserTransactions,
} = require("../controllers/transactionController");

const router = express.Router();
const {
  authMiddleware,
  checkRole,
  authMiddlewareStaff,
} = require("../middlewares/auth");

// Fetch all transactions
router.get(
  "/transactions",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  getAllTransactions
);
// Fetch transactions for a specific user (optional, if users exist)
router.get("/user_transaction", authMiddleware, getUserTransactions);

// Fetch a single transaction by request_id
router.get("/:_id", authMiddleware, getTransactionById);

module.exports = router;
