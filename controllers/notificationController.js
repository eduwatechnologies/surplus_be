const Notification = require("../models/notificationModel");

// Create notification
const createNotification = async (req, res) => {
  try {
    const { title, message } = req.body;
    const notification = new Notification({ title, message });
    await notification.save();
    res.status(201).json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all notifications (optional filter by userId)
const getAllNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find();
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getLatestNotification = async (req, res) => {
  try {
    const notification = await Notification.findOne().sort({ createdAt: -1 });
    if (!notification)
      return res.status(404).json({ error: "No notifications found" });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update notification
const updateNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!notification)
      return res.status(404).json({ error: "Notification not found" });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const deleted = await Notification.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ error: "Notification not found" });
    res.json({ message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createNotification,
  getAllNotifications,
  getLatestNotification,
  updateNotification,
  deleteNotification,
};
