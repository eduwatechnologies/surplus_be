const mongoose = require("mongoose");

const configSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Config", configSchema);

