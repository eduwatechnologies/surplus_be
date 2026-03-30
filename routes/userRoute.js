const express = require("express");
const {
  signUpUser,
  verifyEmail,
  resetPassword,
  loginUser,
  resendVerificationCode,
  refreshToken,
  requestPasswordReset,
  verifyResetCode,
  updatePassword,
  addPin,
  updatePin,
  updateStatus,
  adminUpdateUserPassword,
  adminUpdateUserPin,
  refreshAccessToken,
  logoutUser,
} = require("../controllers/authController");

const { getAllUsers } = require("../controllers/userController");

const {
  CurrentUser,
  updateProfile,
  getUserProfile,
  addUserOwing,
} = require("../controllers/userController");
const {
  authMiddleware,
  checkRole,
  authMiddlewareStaff,
} = require("../middlewares/auth");
const limiter = require("../middlewares/rateLimiter");

const router = express.Router();

// Current User
router.get("/user", authMiddleware, CurrentUser);
// router.get("/refresh-token", authMiddleware, refreshToken);

// User Sign-Up
router.post("/signup", signUpUser);
// User Sign-Up
router.post("/verify", verifyEmail);

// User Login
router.post("/login", loginUser);
router.post("/resend-verification", resendVerificationCode);

router.post("/refresh", refreshAccessToken);
router.post("/logout", authMiddleware, logoutUser);

// User Profile Update (Protected Route)

router.put("/profile", authMiddleware, updateProfile);
router.post("/update-password", authMiddleware, updatePassword);
router.post("/update-pin", authMiddleware, updatePin);
router.post("/add-pin", authMiddleware, addPin);
// Password Reset
router.post("/request-password-reset", requestPasswordReset);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password", resetPassword);

//Admin

router.get(
  "/userInfo/:id",
  authMiddlewareStaff,
  checkRole(["admin"]),
  getUserProfile
);
router.get(
  "/users",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  getAllUsers
);
router.put(
  "/status",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  updateStatus
);
router.put(
  "/admin/update-user-password",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  adminUpdateUserPassword
);
router.put(
  "/admin/update-user-pin",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  adminUpdateUserPin
);

router.put(
  "/admin/add-owing",
  authMiddlewareStaff,
  checkRole(["admin", "manager"]),
  addUserOwing
);

module.exports = router;
