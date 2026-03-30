
const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
   type: {
      type: String,
      enum: ["airtime", "data", "electricity", "cable", "exam", "other"],
      required: true
    },
  description: String,
  status: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Service", serviceSchema);


