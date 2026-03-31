const express = require("express");
const router = express.Router();
const { purchaseData } = require("../controllers/services/databundle");
const { purchaseAirtime } = require("../controllers/services/airtime");
const { purchaseExamPin } = require("../controllers/services/exam");

const {
  verifyMeter,
  purchaseElectricity,
} = require("../controllers/services/electricity");

const {
  purchaseTVSub,
  verifyTVSub,
} = require("../controllers/services/cabletv");

const { authMiddleware, ensureTenantServiceEnabled } = require("../middlewares/auth");

// Buy Services — only authenticated users can purchase
router.post("/purchase-data", authMiddleware, ensureTenantServiceEnabled("data"), purchaseData);
router.post("/purchase-airtime", authMiddleware, ensureTenantServiceEnabled("airtime"), purchaseAirtime);
router.post("/purchase-tvsub", authMiddleware, ensureTenantServiceEnabled("cable_tv"), purchaseTVSub);
router.post(
  "/purchase-electricity",
  authMiddleware,
  ensureTenantServiceEnabled("electricity"),
  purchaseElectricity
);
router.post("/purchase-exam", authMiddleware, ensureTenantServiceEnabled("exam_pin"), purchaseExamPin);

// Verify User Service — also require authentication to avoid abuse
router.post("/verify-tvsub", authMiddleware, ensureTenantServiceEnabled("cable_tv"), verifyTVSub);
router.post("/verify-meter", authMiddleware, ensureTenantServiceEnabled("electricity"), verifyMeter);

module.exports = router;
