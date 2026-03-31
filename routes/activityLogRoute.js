const express = require("express");
const router = express.Router();
const {
  getAllLogs,
  createLog,
} = require("../controllers/activitylogController");

const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");

router.get("/", authMiddlewareStaff, checkRole(["superadmin", "admin", "manager", "support"]), getAllLogs);
router.post("/", authMiddlewareStaff, checkRole(["superadmin", "admin", "manager", "support"]), createLog);

module.exports = router;
