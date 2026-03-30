// models/providerPlanModel.js
const mongoose = require("mongoose");

const providerPlanSchema = new mongoose.Schema({
  provider: { type: String, required: true }, // autopilot, easyaccess
  rawPlanId: String,          // plan id from provider
  name: String,
  network: String,
   type: { type: String, enum: ["data", "airtime", "electricity", "tv", "exam"] }, 
  category: String,        
  validity: String,
  bundle: String,
  price: Number,
  rawData: mongoose.Schema.Types.Mixed // store full raw API response
}, { timestamps: true });

module.exports = mongoose.model("ProviderPlan", providerPlanSchema);
