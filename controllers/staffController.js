const Staff = require("../models/staffModel");
const logger = require("../utils/logger");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const createStaff = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!["superadmin", "admin", "manager", "support"].includes(role)) {
      return res.status(400).json({ error: "Invalid role specified." });
    }

    const existingStaff = await Staff.findOne({ email });
    if (existingStaff) {
      return res.status(409).json({ error: "Email already exists." });
    }

    const newStaff = new Staff({
      name,
      email,
      phone,
      password,
      role,
    });

    await newStaff.save();

    res.status(201).json({
      message: "Staff created successfully",
      staff: {
        id: newStaff._id,
        email: newStaff.email,
        role: newStaff.role,
      },
    });
  } catch (err) {
    console.error("Staff creation error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const loginStaff = async (req, res) => {
  const { email, password } = req.body;

  try {
    const staff = await Staff.findOne({ email });
    if (!staff) {
      return res.status(404).json({ msg: "Staff not found!" });
    }

    const isMatch = await staff.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid credentials!" });
    }

    const token = jwt.sign(
      {
        id: staff._id,
        email: staff.email,
        role: staff.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      }
    );

    logger.info("✅ Staff logged in successfully", { email });
    staff.lastLogin = new Date();
    await staff.save();

    res.status(200).json({
      msg: "Staff Logged In",
      staff: {
        id: staff._id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        status: staff.status,
      },
      token,
    });
  } catch (error) {
    logger.error("❌ Login error", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

const getAllStaff = async (req, res) => {
  try {
    const staffList = await Staff.find().select("-password"); // exclude password
    res.json({ staff: staffList });
  } catch (error) {
    console.error("Error fetching staff:", error);
    res.status(500).json({ msg: "Failed to fetch staff" });
  }
};

const getStaffById = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id).select("-password");
    if (!staff) {
      return res.status(404).json({ msg: "Staff not found" });
    }
    res.json({ staff });
  } catch (error) {
    console.error("Error fetching staff by ID:", error);
    res.status(500).json({ msg: "Failed to fetch staff by ID" });
  }
};

const deleteStaff = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ msg: "Staff not found" });
    }

    await Staff.deleteOne({ _id: req.params.id });

    res.json({ msg: "Staff deleted successfully" });
  } catch (error) {
    console.error("Error deleting staff:", error);
    res.status(500).json({ msg: "Failed to delete staff" });
  }
};

const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = [
      "name",
      "email",
      "role",
      "status",
      "password",
      "phone",
    ];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (updates[field]) {
        updateData[field] = updates[field];
      }
    });

    const staff = await Staff.findById(id);
    if (!staff) {
      return res.status(404).json({ msg: "Staff not found" });
    }

    Object.assign(staff, updateData); // merge updates into staff document
    await staff.save(); // triggers pre-save hook if password is updated

    res.json({
      msg: "Staff updated successfully",
      staff: {
        id: staff._id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        status: staff.status,
      },
    });
  } catch (error) {
    console.error("Error updating staff:", error);
    res.status(500).json({ msg: "Failed to update staff" });
  }
};

module.exports = {
  getStaffById,
  getAllStaff,
  createStaff,
  loginStaff,
  updateStaff,
  deleteStaff,
};
