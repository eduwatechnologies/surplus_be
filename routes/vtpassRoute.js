const express = require("express");
const router = express.Router();
const VTpassController = require("../controllers/vtpassController");
const { authMiddleware } = require("../middlewares/auth");

router.get(
  "/service-variations/:serviceID",
  VTpassController.getServiceVariations
);
router.post(
  "/webhook/vtpass",
  authMiddleware,
  VTpassController.handleVTpassWebhook
);
router.post(
  "/purchase-airtime",
  authMiddleware,
  VTpassController.purchaseAirtime
);
router.post("/purchase-data", authMiddleware, VTpassController.purchaseData);
router.post(
  "/pay-electricity",
  authMiddleware,
  VTpassController.payElectricity
);
router.post(
  "/subscribe-cable",
  authMiddleware,
  VTpassController.subscribeCable
);
router.post("/pay-exam", authMiddleware, VTpassController.payExam);

router.post("/vtpasswebhook", VTpassController.handleVTpassWebhook);
router.post("/verifymeter", authMiddleware, VTpassController.handleVerifymeter);
router.post(
  "/verifysmartcard",
  authMiddleware,
  VTpassController.handleVerifysmartcard
);

module.exports = router;
