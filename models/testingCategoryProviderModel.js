const mongoose = require("mongoose");

const testingCategoryProviderSchema = new mongoose.Schema(
  {
    subServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubService", // Must match the SubService model name
      required: true,
    },
    network: {
      type: String,
      required: true,
      trim: true,
      // enum: ["MTN", "AIRTEL", "GLO", "9MOBILE"], // uncomment to enforce
    },
    category: {
      type: String,
      required: true,
      trim: true,
      // enum: ["SME", "CORPORATE", "GIFTING"], // uncomment to enforce
    },
    provider: {
      type: String,
      required: true,
      enum: ["easyaccess", "autopilot"],
      default: "easyaccess",
    },
    providerCodes: {
      easyaccess: { type: String, default: null },
      autopilot: { type: String, default: null },
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "TestingCategoryProvider",
  testingCategoryProviderSchema
);
