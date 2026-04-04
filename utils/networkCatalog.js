function normalizeNetworkKey(network) {
  const raw = String(network || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "9mobile" || raw === "etisalat") return "9mobile";
  if (raw === "startimes") return "startime";
  if (raw === "glo1") return "glo";
  return raw;
}

function normalizeServiceType(serviceType) {
  const raw = String(serviceType || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "cabletv" || raw === "cable_tv" || raw === "cable-tv") return "cable";
  if (raw === "exampin" || raw === "exam_pin" || raw === "exam-pin") return "exam";
  return raw;
}

const NETWORK_CATALOG_CODES = {
  mtn: ["01"],
  airtel: ["02"],
  "9mobile": ["03"],
  glo: ["04"],

  gotv: ["01", "06", "02"],
  dstv: ["02", "05", "01"],
  startime: ["03", "07"],
  showmax: ["06", "08", "04"],

  ikejaelectric: ["01"],
  ekoelectric: ["02"],
  abujaelectric: ["03"],

  waec: ["01"],
  neco: ["02"],
  nabteb: ["03"],
};

function resolveNetworkCodes(network) {
  const normalized = normalizeNetworkKey(network);
  if (!normalized) return null;
  if (/^\d{2}$/.test(normalized)) return [normalized];
  return NETWORK_CATALOG_CODES[normalized] || null;
}

module.exports = {
  normalizeNetworkKey,
  normalizeServiceType,
  resolveNetworkCodes,
  NETWORK_CATALOG_CODES,
};

