const express = require("express");
const router = express.Router();
const {
  getAllLogs,
  createLog,
} = require("../controllers/activitylogController");

router.get("/", getAllLogs);
router.post("/", createLog);

module.exports = router;
