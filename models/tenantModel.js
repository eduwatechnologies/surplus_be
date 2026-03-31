const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "active",
      index: true,
    },
    brandName: { type: String, default: null, trim: true },
    logoUrl: { type: String, default: null, trim: true },
    primaryColor: { type: String, default: null, trim: true },
    supportEmail: { type: String, default: null, trim: true },
    supportPhone: { type: String, default: null, trim: true },
    disabledServices: {
      type: [String],
      default: [],
      index: true,
    },
    riskSettings: {
      pinRequired: { type: Boolean, default: false },
      velocityWindowMinutes: { type: Number, default: 2 },
      velocityMaxTx: { type: Number, default: 6 },
      dailyAmountLimitUnverified: { type: Number, default: null },
      dailyTxLimitUnverified: { type: Number, default: null },
      dailyAmountLimitVerified: { type: Number, default: null },
      dailyTxLimitVerified: { type: Number, default: null },
      kycRequiredAbove: { type: Number, default: null },
      alerts: {
        failedTransactions: { type: Boolean, default: false },
        email: { type: Boolean, default: false },
      },
    },
  },
  { timestamps: true }
);

tenantSchema.index({ slug: 1 }, { unique: true });

const Tenant = mongoose.model("Tenant", tenantSchema);
module.exports = Tenant;
