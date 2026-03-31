const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bankName: { type: String, default: null },
    bankCode: { type: String, default: null },
    accountNumber: { type: String, unique: true, sparse: true },
    accountName: { type: String, default: null },
    virtualAccountId: { type: String, unique: true, sparse: true },
    reference: { type: String, default: null, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    providerCreatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
const wallet = mongoose.model("wallets", walletSchema);
module.exports = wallet;
