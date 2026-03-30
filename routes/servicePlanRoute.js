const express = require("express");
const {
  getPlansByNetworkAndCategory,
  getCategoriesByNetwork,
  createServicePlan,
  updateServicePlan,
  deleteServicePlan,
} = require("../controllers/servicePlanController");

const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");

const router = express.Router();

// Public read routes
router.get("/plans", getPlansByNetworkAndCategory);
router.get("/categories", getCategoriesByNetwork);

// Admin-only create
router.post("/", authMiddlewareStaff, checkRole(["admin"]), createServicePlan);

// Admin-only update
router.put(
  "/:id",
  authMiddlewareStaff,
  checkRole(["admin"]),
  updateServicePlan
);

// Admin-only delete
router.delete(
  "/:id",
  authMiddlewareStaff,
  checkRole(["admin"]),
  deleteServicePlan
);

module.exports = router;
