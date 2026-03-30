// utils/refNoGenerator.js
const crypto = require("crypto");

/**
 * Generate a unique reference number for AlmaLeek VTU
 * Format: ALMYYYYMMDDHHMMSSXXXX
 * - ALM: Platform tag
 * - YYYYMMDDHHMMSS: Date/Time
 * - XXXX: Random hex (4 chars)
 */
function generateRefNo(prefix = "ALM") {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const randomPart = crypto.randomBytes(2).toString("hex").toUpperCase();

  return `${prefix}${datePart}${randomPart}`;
}

module.exports = generateRefNo;
