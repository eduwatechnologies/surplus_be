const express = require("express");
const router = express.Router();
const BillstackController = require("../controllers/walletController");
const {
  authMiddleware,
  authMiddlewareStaff,
  checkRole,
} = require("../middlewares/auth");

// User creates a virtual account
router.post(
  "/create-account",
  authMiddleware,
  BillstackController.createVirtualAccount
);

// User verifies a payment
router.get(
  "/verify-payment/:reference",
  authMiddleware,
  BillstackController.verifyPayment
);

// Webhook for payment provider — should be validated with a secret/signature
router.post("/almaleek_webhook", BillstackController.handleWebhook);

// Admin-only refund
router.post(
  "/refund",
  authMiddlewareStaff,
  checkRole(["admin"]),
  BillstackController.handleRefundUser
);

// Admin-only defund
router.post(
  "/defund",
  authMiddlewareStaff,
  checkRole(["admin"]),
  BillstackController.handleDefundUser
);

module.exports = router;
