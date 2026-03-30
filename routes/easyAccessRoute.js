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

const { authMiddleware } = require("../middlewares/auth");

// Buy Services — only authenticated users can purchase
router.post("/purchase-data", authMiddleware, purchaseData);
router.post("/purchase-airtime", authMiddleware, purchaseAirtime);
router.post("/purchase-tvsub", authMiddleware, purchaseTVSub);
router.post("/purchase-electricity", authMiddleware, purchaseElectricity);
router.post("/purchase-exam", authMiddleware, purchaseExamPin);

// Verify User Service — also require authentication to avoid abuse
router.post("/verify-tvsub", authMiddleware, verifyTVSub);
router.post("/verify-meter", authMiddleware, verifyMeter);

module.exports = router;
