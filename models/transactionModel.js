const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    service: {
      type: String,
      enum: [
        "airtime",
        "data",
        "data_card",
        "cable_tv",
        "electricity",
        "exam_pin",
        "wallet",
        "refund",
      ],
      required: true,
    },

    // message: String,
    message: { type: String },
    amount: Number,
    provider_reference: { type: String, unique: true, sparse: true },
    reference_no: String,
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      default: "pending",
    },
    transaction_date: Date,
    raw_response: String, // JSON string for full API response

    // Common optional fields
    client_reference: String,

    // Data subscription
    network: String,
    mobile_no: String,
    data_type: String,

    // Data card
    pin: String,

    // Cable TV
    company: String,
    package: String,
    iucno: String,

    // Electricity
    meter_type: String,
    meter_no: String,
    token: String,
    customer_name: String,
    customer_address: String,

    // Exam PINs
    waec_pin: String,
    // neco_token: String,
    // nabteb_pin: String,
    // nbais_pin: String,

    // Wallet-specific
    transaction_type: {
      type: String,
      enum: ["credit", "debit", "refund"],
    },
    previous_balance: Number,
    new_balance: Number,
    note: String,
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// const transactionSchema = new mongoose.Schema({
//   service: String,
//   message: { type: String },
//   raw_response: { type: mongoose.Schema.Types.Mixed },
//   amount: Number,
//   reference_no: String,
//   status: String,
//   transaction_date: Date,
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   previous_balance: Number,
//   new_balance: Number,

//   // ✅ keep all service-specific data here
//   details: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {},
//   },
// });

module.exports = mongoose.model("Transaction", transactionSchema);
