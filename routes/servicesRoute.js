const express = require("express");
const {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
  getServicesWithSubServices,
  toggleServiceStatus,
} = require("../controllers/servicesController");

const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");

const router = express.Router();

// Public route to fetch services with subservices
router.get("/with-subservices", getServicesWithSubServices);

// Only admin can create
router.post("/", authMiddlewareStaff, checkRole(["admin"]), createService);

// Public read routes
router.get("/", getServices);
router.get("/:id", getServiceById);

// Only admin can update or delete
router.put("/:id", authMiddlewareStaff, checkRole(["admin"]), updateService);
router.patch("/:id/toggle-status", authMiddlewareStaff, checkRole(["admin"]), toggleServiceStatus);
router.delete("/:id", authMiddlewareStaff, checkRole(["admin"]), deleteService);

module.exports = router;
