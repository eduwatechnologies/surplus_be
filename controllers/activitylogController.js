const ActivityLog = require("../models/activityLogModel");

const getAllLogs = async (req, res) => {
  try {
    const logs = await ActivityLog.find().sort({ timestamp: -1 });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};

const createLog = async (req, res) => {
  try {
    const log = new ActivityLog(req.body);
    await log.save();
    res.status(201).json({ log });
  } catch (err) {
    res.status(500).json({ error: "Failed to log activity" });
  }
};

module.exports = {
  getAllLogs,
  createLog,
};
