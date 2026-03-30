const User = require("../models/userModel");
const sendEmail = require("../utils/sendEmail");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { generateVerificationCode } = require("../utils/generateVerify");
const logger = require("../utils/logger");
const generateReferralCode = require("../utils/generateReferralCode");
const {
  createVirtualAccountForUser,
} = require("../business_logic/accountLogic");
const { sendSecurityUpdateEmail } = require("../utils/sendSecurityEmail");
const { generateTokens } = require("../middlewares/auth");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_EXPIRES_IN,
} = require("../utils/tokens/token");
const RefreshToken = require("../models/refreshTokenModal");
require("dotenv").config();

// Helpers
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function refreshExpDate() {
  // match REFRESH_EXPIRES_IN = "7d"
  return addDays(new Date(), 7);
}

// Register User
const signUpUser = async (req, res) => {
  const verificationCode = generateVerificationCode();
  const verificationCodeExpiry = Date.now() + 15 * 60 * 1000;
  const { email, phone, referralCode } = req.body;

  try {
    logger.info("User signup attempt", { email, phone });

    // 🔹 Check if email or phone already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ error: "Account already exists!" });
    }

    // 🔹 Create new user
    const user = new User({
      ...req.body,
      verificationCode,
      verificationCodeExpiry,
      isVerified: false,
      referralCode: generateReferralCode(),
      referredBy: referralCode || null,
    });

    await user.save();
    // Reward the referrer
    if (referralCode && referralCode !== user.referralCode) {
      const referrer = await User.findOne({ referralCode });

      if (referrer) {
        referrer.bonus = (referrer.bonus || 0) + 10;
        await referrer.save();
      }
    }

    logger.info("User created successfully", { email });

    res.status(201).json({
      msg: "User registered. Please verify your email.",
      email: user.email,
      // token: token,
    });

    // 🔹 Call Virtual Account Creation After Response (Non-blocking)
    await createVirtualAccountForUser(user);
  } catch (error) {
    logger.error("Sign up error", { error: error.message });
    res
      .status(500)
      .json({ msg: "Internal server error", error: error.message });
  }
};

// Login User
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    logger.info("User login attempt", { email });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    // if (!user.isVerified) {
    //   return res.status(400).json({ msg: "Email not verified" });
    // }

    const userStatus = user.status || "active";
    if (userStatus !== "active") {
      return res
        .status(403)
        .json({ error: "Your account is suspended. Please contact support." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    // 🔹 Delete old refresh tokens if you only want ONE active
    await RefreshToken.deleteMany({ userId: user._id });

    // Access + Refresh
    const accessToken = signAccessToken({
      id: user._id,
      role: user.role,
      email: user.email,
    });
    const refreshToken = signRefreshToken({ id: user._id });

    // Persist refresh token
    await RefreshToken.create({
      token: refreshToken,
      userId: user._id,
      expiresAt: refreshExpDate(),
      createdByIp: req.ip,
    });

    user.lastLogin = new Date();
    user.currentToken = accessToken;
    await user.save();
    logger.info("User logged in successfully", { email });

    res.json({
      accessToken,
      refreshToken, // omit if you go full cookie approach
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    const msg = error?.message || "Internal server error";
    (req.logger || console).error("Login error", { msg, stack: error?.stack });
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Email Verification
const verifyEmail = async (req, res) => {
  const { email, verificationCode } = req.body;
  try {
    logger.info("Email verification attempt", { email });
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send("User not found");
    }
    if (
      user.verificationCode !== verificationCode ||
      Date.now() > user.verificationCodeExpiry
    ) {
      return res.status(400).send("Invalid or expired verification code");
    }

    user.isVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpiry = null;
    await user.save();

    logger.info("Email verified successfully", { email });
    res.status(200).json({ msg: "Email verified successfully" });
  } catch (error) {
    logger.error("Email verification error", { error });
    res.status(500).send(error.msg);
  }
};

const requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(404).json({ error: "User not found" });

  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
  const hashedCode = await bcrypt.hash(code, 10);

  user.resetCode = hashedCode;
  user.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 mins
  await user.save();

  await sendEmail({
    email: user.email,
    subject: "Reset Password Code",
    message: `Your password reset code is: ${code}`,
  });

  res.json({ message: "Reset code sent to email" });
};

// verify reset code
const verifyResetCode = async (req, res) => {
  const { email, code } = req.body;
  const user = await User.findOne({ email });

  if (!user || !user.resetCode || !user.resetCodeExpires)
    return res.status(400).json({ error: "Invalid or expired reset code" });

  const isCodeValid = await bcrypt.compare(code, user.resetCode);
  const isExpired = new Date() > new Date(user.resetCodeExpires);

  if (!isCodeValid || isExpired)
    return res.status(400).json({ error: "Invalid or expired code" });

  // Optional: issue a short-lived JWT token to reset password
  res.json({ message: "Code verified successfully" });
};

//reset-password
const resetPassword = async (req, res) => {
  const { email, newPassword, code } = req.body;

  if (!email || !newPassword || !code) {
    return res
      .status(400)
      .json({ error: "Email, code, and new password are required" });
  }

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });

  const isCodeValid = await bcrypt.compare(code, user.resetCode);
  const isExpired = new Date() > new Date(user.resetCodeExpires);

  if (!isCodeValid || isExpired)
    return res.status(400).json({ error: "Invalid or expired code" });

  user.password = newPassword;

  user.resetCode = undefined;
  user.resetCodeExpires = undefined;

  await user.save();
  await sendEmail({
    email: user.email,
    subject: "Password Reset Confirmation",
    message: "Your password was successfully reset.",
  });

  res.json({ message: "Password reset successful" });
};

const sendVerificationCode = async (user) => {
  const verificationCode = generateVerificationCode();
  const expirationTime = new Date(Date.now() + 10 * 60 * 1000); // Expires in 10 minutes

  // Update user with new code and expiry time
  await User.findByIdAndUpdate(user._id, {
    verificationCode,
    verificationCodeExpiry: expirationTime,
  });

  await sendEmail({
    email: user.email,
    subject: "Your Verification Code",
    message: `Your new verification code is: ${verificationCode}. It expires in 10 minutes.`,
  });

  return verificationCode;
};

const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the code has expired
    if (
      user.verificationCodeExpiry &&
      user.verificationCodeExpiry > Date.now()
    ) {
      return res
        .status(400)
        .json({ error: "Verification code is still valid" });
    }

    // Send a new verification code
    await sendVerificationCode(user);

    res.json({ msg: "A new verification code has been sent to your email" });
  } catch (error) {
    console.error("❌ Error resending verification code:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const incomingToken = req.body?.refreshToken || req.cookies?.refreshToken;
    if (!incomingToken) {
      return res.status(403).json({ error: "No refresh token provided" });
    }

    // Check in DB
    const stored = await RefreshToken.findOne({ token: incomingToken });
    if (!stored) {
      return res.status(403).json({ error: "Invalid refresh token" });
    }

    // Verify signature + expiry
    let decoded;
    try {
      decoded = verifyRefreshToken(incomingToken);
    } catch {
      // token invalid or expired → remove from DB
      await RefreshToken.deleteOne({ token: incomingToken });
      return res
        .status(403)
        .json({ error: "Invalid or expired refresh token" });
    }

    // Issue new access token only
    const accessToken = signAccessToken({ id: decoded.id });

    return res.json({ accessToken }); // refresh token stays the same
  } catch (error) {
    const msg = error?.message || "Internal error refreshing token";
    (req.logger || console).error("Refresh error", {
      msg,
      stack: error?.stack,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "Both current and new passwords are required." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    // const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Update Password Error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

const updatePin = async (req, res) => {
  const { oldpin, newpin } = req.body;

  try {
    const user = await User.findById(req.user._id); // Corrected user ID access

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(oldpin, user.pinCode);
    if (!isMatch) {
      return res.status(401).json({ error: "Old PIN is incorrect" });
    }

    user.pinCode = newpin;
    await user.save();

    return res.status(200).json({ message: "PIN updated successfully" });
  } catch (error) {
    console.error("Update PIN Error:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Toggle status
    user.status = user.status === "active" ? "suspended" : "active";

    await user.save();

    res.status(200).json({
      message: `User status updated to ${user.status}`,
      status: user.status,
    });
  } catch (error) {
    console.error("❌ Error updating user status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const addPin = async (req, res) => {
  const { pin } = req.body;

  // Validate input
  if (!pin || typeof pin !== "string" || pin.trim() === "") {
    return res.status(400).json({ error: "PIN is required" });
  }

  try {
    const user = await User.findById(req.user._id); // From auth middleware

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.pinCode = pin;
    user.pinStatus = true;
    await user.save();

    return res.status(200).json({ message: "PIN added successfully" });
  } catch (error) {
    console.error("Add PIN error:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

//Admin

// ✅ Admin: Update any user's PIN without old PIN check
const adminUpdateUserPin = async (req, res) => {
  const { userId, newpin } = req.body;

  try {
    if (!userId || !newpin) {
      return res
        .status(400)
        .json({ error: "User ID and new PIN are required" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.pinCode = newpin; // Will be hashed in pre-save hook
    user.pinStatus = true;
    await user.save();

    await sendSecurityUpdateEmail({ email: user.email, type: "pin" });

    return res.status(200).json({ message: "User PIN updated successfully" });
  } catch (error) {
    console.error("Admin Update PIN Error:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

// ✅ Admin: Update any user's password without current password check
const adminUpdateUserPassword = async (req, res) => {
  const { userId, newPassword } = req.body;

  try {
    if (!userId || !newPassword) {
      return res
        .status(400)
        .json({ error: "User ID and new password are required." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    user.password = newPassword; // Will be hashed by pre-save middleware
    await user.save();
    // await sendSecurityUpdateEmail({ email: user.email, type: "password" });

    return res
      .status(200)
      .json({ message: "User password updated successfully." });
  } catch (error) {
    console.error("Admin Update Password Error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

const logoutUser = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // 🚨 Clear token so old JWTs stop working
  user.currentToken = null;
  await user.save();

  res.json({ message: "Logged out successfully" });
};

module.exports = {
  signUpUser,
  verifyEmail,
  resetPassword,
  loginUser,
  logoutUser,
  resendVerificationCode,
  refreshAccessToken,
  verifyResetCode,
  requestPasswordReset,
  updatePassword,
  updatePin,
  addPin,
  updateStatus,
  adminUpdateUserPassword,
  adminUpdateUserPin,
};
