const express = require("express");
const router = express.Router();
const {
  getCategoriesBySubServiceId,
  getAllCategoryProviders,
  createCategoryProvider,
  updateCategoryProvider,
  deleteCategoryProvider,
} = require("../controllers/categoryProviderController");

const { authMiddlewareStaff, checkRole } = require("../middlewares/auth");

// Public: Fetch providers (optional — could make admin-only if sensitive)
router.get("/", getAllCategoryProviders);

router.get(
  "/sub-service/:subServiceId",
  authMiddlewareStaff,
  getCategoriesBySubServiceId
);

// Admin-only create
router.post(
  "/",
  authMiddlewareStaff,
  checkRole(["admin"]),
  createCategoryProvider
);

// Admin-only update
router.put(
  "/:id",
  authMiddlewareStaff,
  checkRole(["admin"]),
  updateCategoryProvider
);

// Admin-only delete
router.delete(
  "/:id",
  authMiddlewareStaff,
  checkRole(["admin"]),
  deleteCategoryProvider
);

module.exports = router;
