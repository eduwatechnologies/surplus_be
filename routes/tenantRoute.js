const express = require("express");
const { authMiddleware, checkUserRole } = require("../middlewares/auth");
const {
  onboardMerchant,
  getMyTenant,
  updateMyTenant,
  getMyTenantContext,
  getMyBankAccounts,
  upsertMyPlanPrices,
  getMyPlanPrices,
  getMyPricingCatalog,
  getMyCustomers,
  getMyTransactions,
  getMyCustomer,
  getMyCustomerTransactions,
  updateMyCustomerKyc,
  updateMyCustomerStatus,
  getMyAuditLogs,
  getMyDashboard,
  getUserPlanPrices,
  upsertUserPlanPrices,
  getUserPricingCatalog,
} = require("../controllers/tenantController");

const router = express.Router();

router.post("/onboard", authMiddleware, onboardMerchant);
router.get("/me", authMiddleware, getMyTenant);
router.get("/me/bank-accounts", authMiddleware, checkUserRole(["merchant", "reseller"]), getMyBankAccounts);
router.put("/me", authMiddleware, checkUserRole(["merchant", "reseller"]), updateMyTenant);
router.get("/context", authMiddleware, getMyTenantContext);
router.get("/customers", authMiddleware, checkUserRole(["merchant", "reseller"]), getMyCustomers);
router.get("/customers/:userId", authMiddleware, checkUserRole(["merchant", "reseller"]), getMyCustomer);
router.patch(
  "/customers/:userId/kyc",
  authMiddleware,
  checkUserRole(["merchant", "reseller"]),
  updateMyCustomerKyc
);
router.patch(
  "/customers/:userId/status",
  authMiddleware,
  checkUserRole(["merchant", "reseller"]),
  updateMyCustomerStatus
);
router.get(
  "/customers/:userId/transactions",
  authMiddleware,
  checkUserRole(["merchant", "reseller"]),
  getMyCustomerTransactions
);
router.get("/audit-logs", authMiddleware, checkUserRole(["merchant", "reseller"]), getMyAuditLogs);
router.get("/dashboard", authMiddleware, checkUserRole(["merchant", "reseller"]), getMyDashboard);
router.get("/transactions", authMiddleware, checkUserRole(["merchant", "reseller"]), getMyTransactions);
router.get("/pricing/plans", authMiddleware, checkUserRole(["merchant", "reseller"]), getMyPlanPrices);
router.put("/pricing/plans", authMiddleware, checkUserRole(["merchant", "reseller"]), upsertMyPlanPrices);
router.get("/pricing/catalog", authMiddleware, checkUserRole(["merchant", "reseller"]), getMyPricingCatalog);
router.get("/users/:userId/pricing/plans", authMiddleware, checkUserRole(["merchant", "reseller"]), getUserPlanPrices);
router.put("/users/:userId/pricing/plans", authMiddleware, checkUserRole(["merchant", "reseller"]), upsertUserPlanPrices);
router.get("/users/:userId/pricing/catalog", authMiddleware, checkUserRole(["merchant", "reseller"]), getUserPricingCatalog);

module.exports = router;
