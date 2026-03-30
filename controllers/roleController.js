const Role = require("../models/roleModel");

const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.find().populate("permissions");
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch roles" });
  }
};

const createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const role = new Role({ name, description, permissions });
    await role.save();
    res.status(201).json({ role });
  } catch (err) {
    res.status(500).json({ error: "Failed to create role" });
  }
};

const updateRole = async (req, res) => {
  try {
    const role = await Role.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    }).populate("permissions");
    if (!role) return res.status(404).json({ error: "Not found" });
    res.json({ role });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
};

const deleteRole = async (req, res) => {
  try {
    await Role.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
};

module.exports = {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
};
