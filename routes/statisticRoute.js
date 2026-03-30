const express = require("express");

const {
  getOverallStats,
  getServiceBreakdown,
  getDailyStats,
} = require("../controllers/statisticController");
const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");
const { requireFeature } = require("../middlewares/license");

const router = express.Router();

router.get(
  "/overall",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  requireFeature("analytics", { minTier: "pro" }),
  getOverallStats
);
router.get(
  "/service-breakdown",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  requireFeature("analytics", { minTier: "pro" }),
  getServiceBreakdown
);
router.get(
  "/daily",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  requireFeature("analytics", { minTier: "pro" }),
  getDailyStats
);

module.exports = router;
