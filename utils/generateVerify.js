const crypto = require("crypto");

const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString(); // 6-digit code
};

module.exports = { generateVerificationCode };
