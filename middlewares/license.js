const { getLicenseMode, isFeatureEnabled, loadLicenseStatus } = require("../utils/license/license");

function attachLicense(req, res, next) {
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
  const requestHost = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  req.license = loadLicenseStatus({ requestHost });
  res.setHeader("X-License-Status", req.license.status);
  next();
}

function shouldBypassLicense(req) {
  const p = req.path || "";

  if (p === "/" || p === "/health" || p === "/ready") return true;
  if (p === "/license/status") return true;
  if (p === "/public/branding") return true;

  if (p.startsWith("/auth/")) {
    const allowed = new Set([
      "/auth/signup",
      "/auth/login",
      "/auth/verify",
      "/auth/resend-verification",
      "/auth/refresh",
      "/auth/request-password-reset",
      "/auth/verify-reset-code",
      "/auth/reset-password",
    ]);
    return allowed.has(p);
  }

  if (p.startsWith("/vtpass/")) {
    const allowed = new Set([
      "/vtpass/webhook/vtpass",
      "/vtpass/vtpasswebhook",
    ]);
    return allowed.has(p);
  }

  return false;
}

function enforceLicense(req, res, next) {
  const mode = getLicenseMode();
  if (mode !== "enforce") return next();

  if (shouldBypassLicense(req)) return next();

  const status = req.license?.status;
  if (status === "valid") return next();

  return res.status(402).json({
    error: "License required",
    licenseStatus: status || "unknown",
  });
}

function requireFeature(featureName, { minTier } = {}) {
  return (req, res, next) => {
    const mode = getLicenseMode();
    if (mode === "off") return next();

    const ok = isFeatureEnabled({
      licenseStatus: req.license,
      featureName,
      minTier,
    });

    if (ok) return next();

    if (mode === "warn") return next();

    return res.status(403).json({
      error: "Feature not enabled for this license",
      feature: featureName,
    });
  };
}

module.exports = {
  attachLicense,
  enforceLicense,
  requireFeature,
};
