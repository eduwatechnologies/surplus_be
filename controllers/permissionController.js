const Permission = require("../models/permissionModel");

const getAllPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find();
    res.json({ permissions });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

const createPermission = async (req, res) => {
  try {
    const permission = new Permission(req.body);
    await permission.save();
    res.status(201).json({ permission });
  } catch (err) {
    res.status(500).json({ error: "Failed to create permission" });
  }
};

const updatePermission = async (req, res) => {
  try {
    const permission = await Permission.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!permission) return res.status(404).json({ error: "Not found" });
    res.json({ permission });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
};

const deletePermission = async (req, res) => {
  try {
    await Permission.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
};

module.exports = {
  getAllPermissions,
  createPermission,
  updatePermission,
  deletePermission,
};
