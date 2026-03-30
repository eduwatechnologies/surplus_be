const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    staffId: String,
    staffName: String,
    action: String,
    description: String,
    module: String,
    metadata: Object,
    ipAddress: String,
  },
  { timestamps: { createdAt: "timestamp" } }
);

module.exports = mongoose.model("ActivityLog", logSchema);
