const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_LICENSE_FILE_PATH = path.join(process.cwd(), "license.json");

function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);

  const keys = Object.keys(value).sort();
  const out = {};
  for (const key of keys) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

function canonicalStringify(obj) {
  return JSON.stringify(canonicalize(obj));
}

function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function normalizeTier(tier) {
  const t = String(tier || "").toLowerCase();
  if (t === "basic" || t === "pro" || t === "enterprise") return t;
  return "basic";
}

function readPublicKeyPem() {
  const pemFromEnv = process.env.LICENSE_PUBLIC_KEY_PEM;
  if (pemFromEnv && pemFromEnv.trim()) return pemFromEnv;

  const keyPath = process.env.LICENSE_PUBLIC_KEY_PATH;
  if (!keyPath) return null;

  const resolved = path.isAbsolute(keyPath)
    ? keyPath
    : path.join(process.cwd(), keyPath);
  return fs.readFileSync(resolved, "utf8");
}

function verifySignature({ payload, signatureBase64, publicKeyPem }) {
  if (!publicKeyPem) return { ok: false, reason: "public_key_missing" };
  if (!signatureBase64) return { ok: false, reason: "signature_missing" };

  let signature;
  try {
    signature = Buffer.from(signatureBase64, "base64");
  } catch {
    return { ok: false, reason: "signature_invalid_base64" };
  }

  const message = Buffer.from(canonicalStringify(payload), "utf8");
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(message);
  verifier.end();

  const ok = verifier.verify(publicKeyPem, signature);
  return ok ? { ok: true } : { ok: false, reason: "signature_invalid" };
}

function isDomainAllowed({ allowedDomains, requestHost }) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) return true;
  if (!requestHost) return true;

  const host = String(requestHost).toLowerCase();
  return allowedDomains.some((d) => String(d).toLowerCase() === host);
}

function buildLicenseStatus({ payload, signature, publicKeyPem, requestHost }) {
  if (!payload || typeof payload !== "object") {
    return { status: "invalid", reason: "payload_missing" };
  }

  const tier = normalizeTier(payload.tier);
  const expiresAt = parseIsoDate(payload.expiresAt);
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    return { status: "expired", tier, expiresAt: expiresAt.toISOString() };
  }

  const domains = Array.isArray(payload.domains) ? payload.domains : [];
  if (!isDomainAllowed({ allowedDomains: domains, requestHost })) {
    return { status: "invalid", reason: "domain_not_allowed", tier };
  }

  const verification = verifySignature({
    payload,
    signatureBase64: signature,
    publicKeyPem,
  });
  if (!verification.ok) {
    return { status: "invalid", reason: verification.reason, tier };
  }

  return {
    status: "valid",
    tier,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    features: payload.features && typeof payload.features === "object" ? payload.features : {},
    customer: payload.customer ? String(payload.customer) : null,
  };
}

let cache = {
  filePath: null,
  mtimeMs: null,
  status: null,
};

function getLicenseMode() {
  const mode = String(process.env.LICENSE_MODE || "off").toLowerCase();
  if (mode === "off" || mode === "warn" || mode === "enforce") return mode;
  return "off";
}

function getLicenseFilePath() {
  const p = process.env.LICENSE_FILE_PATH || DEFAULT_LICENSE_FILE_PATH;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function loadLicenseStatus({ requestHost } = {}) {
  const mode = getLicenseMode();
  const filePath = getLicenseFilePath();

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return {
      mode,
      status: "missing",
      filePath,
      checkedAt: new Date().toISOString(),
    };
  }

  if (cache.filePath === filePath && cache.mtimeMs === stat.mtimeMs && cache.status) {
    return { ...cache.status, mode };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    const status = {
      mode,
      status: "invalid",
      reason: "read_failed",
      filePath,
      checkedAt: new Date().toISOString(),
    };
    cache = { filePath, mtimeMs: stat.mtimeMs, status };
    return status;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const status = {
      mode,
      status: "invalid",
      reason: "json_invalid",
      filePath,
      checkedAt: new Date().toISOString(),
    };
    cache = { filePath, mtimeMs: stat.mtimeMs, status };
    return status;
  }

  const publicKeyPem = readPublicKeyPem();
  const computed = buildLicenseStatus({
    payload: parsed.payload,
    signature: parsed.signature,
    publicKeyPem,
    requestHost,
  });

  const status = {
    mode,
    ...computed,
    filePath,
    checkedAt: new Date().toISOString(),
  };

  cache = { filePath, mtimeMs: stat.mtimeMs, status };
  return status;
}

function getTierRank(tier) {
  const t = normalizeTier(tier);
  if (t === "basic") return 1;
  if (t === "pro") return 2;
  if (t === "enterprise") return 3;
  return 1;
}

function isFeatureEnabled({ licenseStatus, featureName, minTier }) {
  if (!licenseStatus) return true;
  if (licenseStatus.mode === "off") return true;

  if (minTier) {
    return getTierRank(licenseStatus.tier) >= getTierRank(minTier);
  }

  const features = licenseStatus.features && typeof licenseStatus.features === "object"
    ? licenseStatus.features
    : {};

  if (Object.prototype.hasOwnProperty.call(features, featureName)) {
    return Boolean(features[featureName]);
  }

  return true;
}

module.exports = {
  getLicenseMode,
  loadLicenseStatus,
  isFeatureEnabled,
};

