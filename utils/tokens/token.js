const jwt = require("jsonwebtoken");

require("dotenv").config();

const ACCESS_EXPIRES_IN = "3h";   // short-lived
const REFRESH_EXPIRES_IN = "7d";   // long-lived


function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
    algorithm: "HS256",
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
    algorithm: "HS256",
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
    algorithms: ["HS256"],
  });
}




module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  ACCESS_EXPIRES_IN,
  REFRESH_EXPIRES_IN,
};

