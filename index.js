require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const connectDB = require("./connectionDB/db");
const { errorHandler } = require("./middlewares/error");
const limiter = require("./middlewares/rateLimiter");
const apiRoutes = require("./routes/rootRoute");
const RequestLog = require("./middlewares/log");
const mongoose = require("mongoose");
const { attachTenantFromHost } = require("./middlewares/auth");

const app = express();
const port = process.env.PORT || 4000;

// ✅ Trust proxy (important for rate limiting behind Render/z
app.set("trust proxy", 1);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const allowedOrigins = [
  process.env.FRONTEND_URL,
 "https://surplusfe-production.up.railway.app",
 "https://surplusadmin.up.railway.app",
  "http://localhost:3000",
  "http://localhost:3002",
];
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  })
);

// app.use("/api", limiter);

// app.use(RequestLog);
// Body Parser
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ✅ Healthcheck route to prevent cold start
app.get("/", (req, res) => {
  res.send("✅ I'm alive");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/ready", (req, res) => {
  const readyState = mongoose.connection?.readyState;
  if (readyState === 1) return res.status(200).json({ ok: true });
  return res.status(503).json({ ok: false, db: "not_ready" });
});

app.use("/api", attachTenantFromHost, apiRoutes);
app.use(errorHandler);
connectDB();
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
