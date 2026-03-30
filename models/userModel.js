const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      match: /^[0-9]{10,15}$/,
    },
    role: {
      type: String,
      enum: ["admin", "manager", "support", "user", "agent"], // "user" = customer
      default: "user",
    },

    state: { type: String, required: true },
    password: { type: String, required: true },
    pinStatus: { type: Boolean, default: true },
    pinCode: { type: String, default: null },
    verificationCode: { type: String, default: null },
    verificationCodeExpiry: { type: Date, default: null },
    isVerified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    resetCode: { type: String, default: null },
    resetCodeExpires: { type: Date, default: null },
    referralCode: { type: String, unique: true },
    currentToken: { type: String, default: null },
    referredBy: {
      type: String,
      default: null,
    },
    bonus: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    owning: { type: Number, default: 0 },
    account: {
      bankName: { type: String, default: null },
      accountNumber: { type: String, unique: true, sparse: true }, // Ensure uniqueness
      accountName: { type: String, default: null },
      virtualAccountId: { type: String, unique: true, sparse: true }, // For virtual accounts
    },
  },
  { timestamps: true } // Adds createdAt and updatedAt
);

// 🔑 Hash password before saving
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }

  // Hash PIN code if modified
  if (this.isModified("pinCode") && this.pinCode) {
    this.pinCode = await bcrypt.hash(this.pinCode, 10);
    this.pinStatus = true;
  }
  next();
});

// 🔐 Compare Password Method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.compareUserPin = async function (enteredPin) {
  return await bcrypt.compare(enteredPin, this.userPinCode);
};

const User = mongoose.model("User", userSchema);
module.exports = User;
