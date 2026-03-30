const express = require("express");
const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");
const { requireFeature } = require("../middlewares/license");
const {
  getBrandConfig,
  updateBrandConfig,
  getProviderConfig,
  updateProviderConfig,
} = require("../controllers/configController");

const router = express.Router();

router.get(
  "/branding",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  getBrandConfig
);

router.put(
  "/branding",
  authMiddlewareStaff,
  checkRole(["admin"]),
  updateBrandConfig
);

router.get(
  "/providers",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  getProviderConfig
);

router.put(
  "/providers",
  authMiddlewareStaff,
  checkRole(["admin"]),
  requireFeature("provider_manager", { minTier: "pro" }),
  updateProviderConfig
);

module.exports = router;

