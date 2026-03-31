
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const Tenant = require("../models/tenantModel");
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

    const requestTenantId = req.tenantId;
    if (
      requestTenantId &&
      user.tenantId &&
      String(user.tenantId) !== String(requestTenantId)
    ) {
      return res
        .status(403)
        .json({ error: "Account not linked to this merchant" });
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

const optionalAuthMiddleware = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

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

    if (user.currentToken !== token) {
      return res.status(401).json({ error: "Logged in on another device" });
    }

    const requestTenantId = req.tenantId;
    if (
      requestTenantId &&
      user.tenantId &&
      String(user.tenantId) !== String(requestTenantId)
    ) {
      return res
        .status(403)
        .json({ error: "Account not linked to this merchant" });
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

function parseTenantSlugFromHost(hostHeader) {
  const host = String(hostHeader || "")
    .trim()
    .toLowerCase()
    .split(",")[0]
    .split(":")[0];

  if (!host) return null;
  if (host === "localhost" || host.endsWith(".localhost")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;

  const parts = host.split(".").filter(Boolean);
  if (parts.length < 3) return null;

  const slug = parts[0];
  if (!slug || ["www", "api", "app"].includes(slug)) return null;

  if (!/^[a-z0-9-]{3,30}$/.test(slug)) return null;
  return slug;
}

const attachTenantFromHost = asyncHandler(async (req, res, next) => {
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
  const requestHost = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const slug = parseTenantSlugFromHost(requestHost);
  if (!slug) return next();

  const tenant = await Tenant.findOne({ slug, status: "active" }).select("_id slug");
  if (!tenant) return next();

  req.tenant = tenant;
  req.tenantId = tenant._id;
  next();
});

const ensureTenantServiceEnabled = (serviceType) =>
  asyncHandler(async (req, res, next) => {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return next();

    const tenant = await Tenant.findOne({ _id: tenantId, status: "active" })
      .select("disabledServices")
      .lean();

    if (!tenant) {
      return res.status(403).json({ error: "Merchant not found" });
    }

    const disabled = Array.isArray(tenant.disabledServices) ? tenant.disabledServices : [];
    const s = String(serviceType || "").trim().toLowerCase();
    if (s && disabled.includes(s)) {
      return res.status(403).json({ error: "Service currently unavailable" });
    }

    return next();
  });


// Staff auth middleware
const authMiddlewareStaff = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw new Error("Not authorized, no token");

  if (tokenBlacklist.has(token)) throw new Error("Token has been invalidated");

  try {
    const decoded = verifyJwtToken(token);
    const staffRoles = ["superadmin", "admin", "manager", "support"];
    if (decoded?.role && !staffRoles.includes(decoded.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
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

const checkUserRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
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
  optionalAuthMiddleware,
  attachTenantFromHost,
  ensureTenantServiceEnabled,
  authMiddlewareStaff,
  checkRole,
  checkUserRole,
  logoutUser,
  generateTokens,
  refreshAccessToken,
};
