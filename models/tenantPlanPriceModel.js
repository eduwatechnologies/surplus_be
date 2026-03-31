const mongoose = require("mongoose");

const tenantPlanPriceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServicePlan",
      required: true,
      index: true,
    },
    pricingType: {
      type: String,
      enum: ["fixed", "flat_markup", "percent_markup"],
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

tenantPlanPriceSchema.index({ tenantId: 1, userId: 1, planId: 1 }, { unique: true });

module.exports = mongoose.model("TenantPlanPrice", tenantPlanPriceSchema);
