const ActivityLog = require("../models/activityLogModel");

const getAllLogs = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "200"), 10) || 200, 1), 500);
    const tenantId = String(req.query.tenantId || "").trim();
    const module = String(req.query.module || "").trim();
    const action = String(req.query.action || "").trim();
    const actorType = String(req.query.actorType || "").trim();
    const actorId = String(req.query.actorId || "").trim();

    const q = {};
    if (tenantId) q.tenantId = tenantId;
    if (module) q.module = module;
    if (action) q.action = action;
    if (actorType) q.actorType = actorType;
    if (actorId) q.actorId = actorId;

    const logs = await ActivityLog.find(q).sort({ timestamp: -1 }).limit(limit);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};

const createLog = async (req, res) => {
  try {
    const staff = req.staff || null;
    const body = req.body || {};
    const log = new ActivityLog({
      tenantId: body.tenantId || null,
      actorType: "staff",
      actorId: staff?._id ? String(staff._id) : null,
      actorName: staff?.name || staff?.email || null,
      staffId: staff?._id ? String(staff._id) : null,
      staffName: staff?.name || null,
      action: body.action,
      description: body.description,
      module: body.module,
      metadata: body.metadata,
      ipAddress: req.ip,
    });
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
