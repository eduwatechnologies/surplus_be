const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    actorType: { type: String, enum: ["staff", "user"], default: "staff", index: true },
    actorId: { type: String, default: null, index: true },
    actorName: { type: String, default: null },
    staffId: { type: String, default: null },
    staffName: { type: String, default: null },
    action: String,
    description: String,
    module: String,
    metadata: Object,
    ipAddress: String,
  },
  { timestamps: { createdAt: "timestamp" } }
);

module.exports = mongoose.model("ActivityLog", logSchema);
