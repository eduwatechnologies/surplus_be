const express = require("express");
const router = express.Router();
const { getLicenseMode } = require("../utils/license/license");

/* Feature routes */
const userRoutes = require("./userRoute");
const staffRoutes = require("./staffRoute");
const vtpassRoutes = require("./vtpassRoute");
const billstackRoutes = require("./billstackRoutes");
const txnRoutes = require("./transactionRoute");
const notifyRoutes = require("./notificationRouter");
const easyRoutes = require("./easyAccessRoute");
const permRoutes = require("./permissionRoute");
const roleRoutes = require("./roleRoute");
const logRoutes = require("./activityLogRoute");
const planRoutes = require("./servicePlanRoute");
const apiProviderRoutes = require("./apiProviderRoute");
const paymentProviderRoutes = require("./paymentProviderRoute");
const walletRoutes = require("./walletRoute");
const serviceRoutes = require("./servicesRoute");
const subServiceRoutes = require("./subServicesRoute");
const categoryProviderRoutes = require("./categoryProviderRoute");
const statisticsRoutes = require("./statisticRoute");
const configRoutes = require("./configRoute");
const { getPublicBranding } = require("../controllers/configController");

/* Mount each base route */
router.get("/license/status", (req, res) => {
  const lic = req.license || {};
  res.json({
    mode: getLicenseMode(),
    status: lic.status || "unknown",
    tier: lic.tier || null,
    expiresAt: lic.expiresAt || null,
    features: lic.features || {},
    customer: lic.customer || null,
  });
});
router.get("/public/branding", getPublicBranding);
router.use("/auth", userRoutes);
router.use("/staff", staffRoutes);
router.use("/vtpass", vtpassRoutes);
router.use("/billstack", billstackRoutes);
router.use("/transactions", txnRoutes);
router.use("/notifications", notifyRoutes);
router.use("/easyaccess", easyRoutes);
router.use("/permissions", permRoutes);
router.use("/roles", roleRoutes);
router.use("/logs", logRoutes);
router.use("/plans", planRoutes);
router.use("/network-providers", apiProviderRoutes);
router.use("/payment-providers", paymentProviderRoutes);
router.use("/wallets", walletRoutes);
router.use("/services", serviceRoutes);
router.use("/subservices", subServiceRoutes);
router.use("/category-providers", categoryProviderRoutes);
router.use("/statistics", statisticsRoutes);
router.use("/config", configRoutes);
module.exports = router;
