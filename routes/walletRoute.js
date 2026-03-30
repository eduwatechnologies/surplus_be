const express = require("express");
const {
 createVirtualAccount,
 getVirtualAccount
} = require("../controllers/walletController");

const router = express.Router();

const { authMiddleware } = require("../middlewares/auth");

router.get("/virtual-account/:userId", authMiddleware, getVirtualAccount);

router.post("/create-virtual-account", authMiddleware, createVirtualAccount);


module.exports = router;
