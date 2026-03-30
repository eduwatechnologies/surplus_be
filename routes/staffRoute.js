const express = require("express");
const {
  createStaff,
  loginStaff,
  getStaffById,
  getAllStaff,
  updateStaff,
  deleteStaff,
} = require("../controllers/staffController");
const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");
const limiter = require("../middlewares/rateLimiter");

const router = express.Router();

router.post("/create", authMiddlewareStaff, checkRole(["admin"]), createStaff);
router.post("/login", limiter, loginStaff);
// router.post("/init-admin", createStaff);
router.get("/:id", authMiddlewareStaff, checkRole(["admin"]), getStaffById);
router.get("/", authMiddlewareStaff, checkRole(["admin"]), getAllStaff);
router.put("/:id", authMiddlewareStaff, checkRole(["admin"]), updateStaff);
router.delete("/:id", authMiddlewareStaff, checkRole(["admin"]), deleteStaff);

module.exports = router;
