const express = require("express");
const router = express.Router();
const {
  getAllPermissions,
  createPermission,
  updatePermission,
  deletePermission,
} = require("../controllers/permissionController");

const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");

// Only admins should manage permissions
router.get("/", authMiddlewareStaff, checkRole(["admin"]), getAllPermissions);
router.post("/", authMiddlewareStaff, checkRole(["admin"]), createPermission);
router.put(
  "/:id",
  authMiddlewareStaff,
  checkRole(["admin"]),
  updatePermission
);
router.patch(
  "/:id",
  authMiddlewareStaff,
  checkRole(["admin"]),
  updatePermission
);
router.delete(
  "/:id",
  authMiddlewareStaff,
  checkRole(["admin"]),
  deletePermission
);

module.exports = router;
