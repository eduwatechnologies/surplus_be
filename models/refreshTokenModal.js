const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, index: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true },
    createdByIp: String,
    replacedByToken: String, // track rotation chain (optional)
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
