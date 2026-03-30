const express = require("express");
const router = express.Router();
const {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
} = require("../controllers/roleController");

const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");

// Only admins should manage roles
router.get("/", authMiddlewareStaff, checkRole(["admin"]), getAllRoles);
router.post("/", authMiddlewareStaff, checkRole(["admin"]), createRole);
router.put("/:id", authMiddlewareStaff, checkRole(["admin"]), updateRole);
router.patch("/:id", authMiddlewareStaff, checkRole(["admin"]), updateRole);
router.delete("/:id", authMiddlewareStaff, checkRole(["admin"]), deleteRole);

module.exports = router;
