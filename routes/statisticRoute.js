const express = require("express");

const {
  getOverallStats,
  getServiceBreakdown,
  getDailyStats,
} = require("../controllers/statisticController");
const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");

const router = express.Router();

router.get(
  "/overall",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  getOverallStats
);
router.get(
  "/service-breakdown",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  getServiceBreakdown
);
router.get(
  "/daily",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  getDailyStats
);

module.exports = router;
