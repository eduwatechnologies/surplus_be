

const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({   
       user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
        bankName: { type: String, default: null },
        accountNumber: { type: String, unique: true, sparse: true }, // Ensure uniqueness
        accountName: { type: String, default: null },
        virtualAccountId: { type: String, unique: true, sparse: true }, // For virtual accounts
})
const wallet = mongoose.model("wallets", walletSchema);
module.exports = wallet;