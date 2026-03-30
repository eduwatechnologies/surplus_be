// models/categoryProviderModel.js
const mongoose = require("mongoose");

const categoryProviderSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, unique: true }, // e.g., SME, CORPORATE
    provider: { type: String, required: true }, // e.g., easyaccess, autopilot
    status: { type: Boolean, default: true }, // true = active, false = inactive
  },
  { timestamps: true }
);

module.exports = mongoose.model("CategoryProvider", categoryProviderSchema);
