const express = require("express");
const {
  createSubService,
  getSubServices,
  getSubServiceById,
  updateSubService,
  deleteSubService,
  toggleSubServiceStatus,
  switchProvider,
} = require("../controllers/subServicesController");

const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");

const router = express.Router();

// Only admin can create sub-service
router.post("/", authMiddlewareStaff, checkRole(["admin"]), createSubService);

// Everyone can view
router.get("/", getSubServices);
router.get("/:id", getSubServiceById);

// Only admin can update or delete
router.put("/:id", authMiddlewareStaff, checkRole(["admin"]), updateSubService);
router.delete(
  "/:id",
  authMiddlewareStaff,
  checkRole(["admin"]),
  deleteSubService
);

// Only admin can toggle status or switch provider
router.patch(
  "/:id/toggle-status",
  authMiddlewareStaff,
  checkRole(["admin"]),
  toggleSubServiceStatus
);
router.patch(
  "/:id/switch-provider",
  authMiddlewareStaff,
  checkRole(["admin"]),
  switchProvider
);

module.exports = router;
