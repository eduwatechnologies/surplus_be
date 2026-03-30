const mongoose = require("mongoose");

const WebhookSchema = new mongoose.Schema({
  url: String,
  secret: String,
  events: [String],
  enabled: { type: Boolean, default: false },
});

const NetworkProviderSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    baseUrl: { type: String, required: true },
    token: { type: String, required: true },
    publicKey: { type: String },
    secretKey: { type: String },
    autoWalletFunding: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    testMode: { type: Boolean, default: true },
    webhook: WebhookSchema,
  },
  { timestamps: true }
);

module.exports = mongoose.model("NetworkProvider", NetworkProviderSchema);
