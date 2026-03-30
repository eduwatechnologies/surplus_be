const express = require("express");
const router = express.Router();
const {
  createProvider,
  getAllProviders,
  getProviderById,
  updateProvider,
  deleteProvider,
} = require("../controllers/apiProviderController");

const { authMiddleware, checkRole } = require("../middlewares/auth");

// Admin-only create
router.post("/", authMiddleware, checkRole(["admin"]), createProvider);

// Admin-only read (or make public if needed)
router.get("/", authMiddleware, checkRole(["admin"]), getAllProviders);
router.get("/:id", authMiddleware, checkRole(["admin"]), getProviderById);

// Admin-only update/delete
router.put("/:id", authMiddleware, checkRole(["admin"]), updateProvider);
router.delete("/:id", authMiddleware, checkRole(["admin"]), deleteProvider);

module.exports = router;
