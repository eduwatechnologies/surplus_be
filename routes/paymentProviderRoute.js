const express = require("express");
const router = express.Router();
const controller = require("../controllers/paymentProviderController");
const { authMiddleware, checkRole } = require("../middlewares/auth");

// Only admins can create a provider
router.post("/", authMiddleware, checkRole(["admin"]), controller.createProvider);

// Public read routes (optional: make admin-only if providers shouldn't be public)
router.get("/", authMiddleware, checkRole(["admin"]), controller.getProviders);
router.get("/:id", authMiddleware, checkRole(["admin"]), controller.getProviderById);

// Only admins can update or delete
router.put("/:id", authMiddleware, checkRole(["admin"]), controller.updateProvider);
router.delete("/:id", authMiddleware, checkRole(["admin"]), controller.deleteProvider);

module.exports = router;
