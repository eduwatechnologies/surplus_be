
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const Staff = require("../models/staffModel");
const {verifyAccessToken} = require("../utils/tokens/token")

const tokenBlacklist = new Set();

// Extract token from header
const extractToken = (req) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    return req.headers.authorization.split(" ")[1];
  }
  return null;
};

// Generate tokens
const generateTokens = (user) => {
  
  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    {
      expiresIn: "15m",
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    }
  );

  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );

  refreshTokenStore.add(refreshToken); // store refresh token
  return { accessToken, refreshToken };
};

// Verify JWT
const verifyJwtToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
  });
};

// User auth middleware
// const authMiddleware = asyncHandler(async (req, res, next) => {
//   const token = extractToken(req);
//   if (!token) throw new Error("Not authorized, no token");

//   if (tokenBlacklist.has(token)) throw new Error("Token has been invalidated");

//   try {
//     const decoded = verifyAccessToken(token);
//     const user = await User.findById(decoded.id).select("-password");
//     if (!user) throw new Error("User no longer exists");

//     if (user.status !== "active") {
//       return res
//         .status(403)
//         .json({ error: "Your account is suspended. Please contact support." });
//     }
//     req.user = user;
//     next();
//   } catch (error) {
//     if (error.name === "TokenExpiredError") {
//       return res.status(401).json({ error: "Token expired", logout: true });
//     }
//     error.statusCode = 401;
//     throw error;
//   }
// });

const authMiddleware = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw new Error("Not authorized, no token");

  if (tokenBlacklist.has(token)) throw new Error("Token has been invalidated");

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) throw new Error("User no longer exists");

    if (user.status !== "active") {
      return res
        .status(403)
        .json({ error: "Your account is suspended. Please contact support." });
    }

    // 🚨 Ensure token matches stored session
    if (user.currentToken !== token) {
      return res.status(401).json({ error: "Logged in on another device" });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired", logout: true });
    }
    error.statusCode = 401;
    throw error;
  }
});


// Staff auth middleware
const authMiddlewareStaff = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw new Error("Not authorized, no token");

  if (tokenBlacklist.has(token)) throw new Error("Token has been invalidated");

  try {
    const decoded = verifyJwtToken(token);
    const staff = await Staff.findById(decoded.id).select("-password");
    if (!staff) throw new Error("Staff no longer exists");
    req.staff = staff;
    next();
  } catch (error) {
    error.statusCode = 401;
    throw error;
  }
});

// Role checking for staff
const checkRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
};

// Refresh token route
const refreshAccessToken = asyncHandler((req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokenStore.has(refreshToken)) {
    return res.status(403).json({ error: "Invalid refresh token" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const accessToken = jwt.sign(
      { id: decoded.id },
      process.env.JWT_SECRET,
      {
        expiresIn: "15m",
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      }
    );
    res.json({ accessToken });
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired refresh token" });
  }
});

// Logout (blacklist token + remove refresh)
const logoutUser = asyncHandler((req, res) => {
  const token = extractToken(req);
  const { refreshToken } = req.body;

  if (token) tokenBlacklist.add(token);
  if (refreshToken && refreshTokenStore.has(refreshToken)) {
    refreshTokenStore.delete(refreshToken);
  }

  res.status(200).json({ success: true, message: "Logged out successfully" });
});

module.exports = {
  authMiddleware,
  authMiddlewareStaff,
  checkRole,
  logoutUser,
  generateTokens,
  refreshAccessToken,
};
