const mongoose = require("mongoose");

const subServiceSchema = new mongoose.Schema(
  {
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    name: { type: String, required: true }, // MTN, GLO
    code: { type: String, required: true, unique: true }, // e.g. "MTN-DATA"
    type: String, // optional e.g. "data"

    provider: {
      type: String,
      enum: ["easyaccess", "autopilot"],
      default: "easyaccess",
    },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubService", subServiceSchema);
