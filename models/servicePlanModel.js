const mongoose = require("mongoose");

const servicePlanSchema = new mongoose.Schema(
  {
    subServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubService",
      required: true,
    },
    subCode: { type: String },

    name: { type: String, required: true }, // e.g., "1GB (SME)"
    validity: { type: String }, // e.g., "7 Days"
    category: { type: String }, // e.g., "SME", "GIFTING"
    serviceType: { type: String, required: true }, // e.g., "data"
    network: { type: String, required: true }, // e.g., "01" for MTN
    ourPrice: { type: Number },
    easyaccessId: { type: String },
    autopilotId: { type: String },
    planKey: { type: String },
    planKind: { type: String, enum: ["fixed", "variable"], default: "fixed" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

servicePlanSchema.index({ planKey: 1 }, { unique: true, sparse: true });
servicePlanSchema.index({
  subServiceId: 1,
  category: 1,
  name: 1,
  validity: 1,
  network: 1,
  serviceType: 1,
});

module.exports = mongoose.model("ServicePlan", servicePlanSchema);
