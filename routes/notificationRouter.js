const express = require("express");
const router = express.Router();
const {
  createNotification,
  getAllNotifications,
  getLatestNotification,
  updateNotification,
  deleteNotification,
} = require("../controllers/notificationController");

const { authMiddleware, checkRole } = require("../middlewares/auth");

// Only admins can create notifications
router.post("/create", authMiddleware, checkRole(["admin"]), createNotification);

// Only admins can view all notifications
router.get("/all", authMiddleware, checkRole(["admin"]), getAllNotifications);

// Public: Get latest notification (if this is user-facing news/alerts)
router.get("/latest", getLatestNotification);

// Only admins can update notifications
router.put("/:id", authMiddleware, checkRole(["admin"]), updateNotification);

// Only admins can delete notifications
router.delete("/:id", authMiddleware, checkRole(["admin"]), deleteNotification);

module.exports = router;
