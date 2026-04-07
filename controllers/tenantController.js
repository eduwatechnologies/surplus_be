const asyncHandler = require("express-async-handler");
const Tenant = require("../models/tenantModel");
const User = require("../models/userModel");
const ServicePlan = require("../models/servicePlanModel");
const TenantPlanPrice = require("../models/tenantPlanPriceModel");
const Service = require("../models/servicesModel");
const Transaction = require("../models/transactionModel");
const RefreshToken = require("../models/refreshTokenModal");
const ActivityLog = require("../models/activityLogModel");
const { signAccessToken, signRefreshToken } = require("../utils/tokens/token");
const { resolveNetworkCodes, normalizeServiceType } = require("../utils/networkCatalog");

function normalizeSlug(slug) {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidSlug(slug) {
  return /^[a-z0-9-]{3,30}$/.test(slug);
}

function computeSellingPrice(basePrice, override) {
  const base = Number(basePrice);
  if (!Number.isFinite(base) || base <= 0) return null;
  if (!override || override.active === false) return base;

  const value = Number(override.value);
  if (!Number.isFinite(value)) return base;

  if (override.pricingType === "fixed") {
    return value >= base ? value : base;
  }
  if (override.pricingType === "flat_markup") {
    return base + value;
  }
  if (override.pricingType === "percent_markup") {
    return base + (base * value) / 100;
  }
  return base;
}

async function createUserAuditLog({ req, tenantId, module, action, description, metadata }) {
  const u = req.user || null;
  const firstName = typeof u?.firstName === "string" ? u.firstName.trim() : "";
  const lastName = typeof u?.lastName === "string" ? u.lastName.trim() : "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  const actorName = name || u?.email || null;

  await ActivityLog.create({
    tenantId,
    actorType: "user",
    actorId: u?._id ? String(u._id) : null,
    actorName,
    action,
    description,
    module,
    metadata: metadata || null,
    ipAddress: req.ip,
  });
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function refreshExpDate() {
  return addDays(new Date(), 7);
}

const getPublicTenantBranding = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  const tenant = await Tenant.findOne({ slug }).select(
    "slug status brandName logoUrl primaryColor supportEmail supportPhone"
  );

  if (!tenant || tenant.status !== "active") {
    return res.status(404).json({ error: "Merchant not found" });
  }

  return res.json({
    data: {
      slug: tenant.slug,
      brandName: tenant.brandName || null,
      logoUrl: tenant.logoUrl || null,
      primaryColor: tenant.primaryColor || null,
      supportEmail: tenant.supportEmail || null,
      supportPhone: tenant.supportPhone || null,
    },
  });
});

const getPublicTenantPlans = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  const serviceType = String(req.query.serviceType || "").trim().toLowerCase();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "12"), 10) || 12, 1), 50);

  const tenant = await Tenant.findOne({ slug }).select("_id status slug disabledServices");
  if (!tenant || tenant.status !== "active") {
    return res.status(404).json({ error: "Merchant not found" });
  }

  const enabledTypesRows = await Service.find({ status: true }).select("type -_id").lean();
  const enabledTypes = new Set((enabledTypesRows || []).map((r) => String(r.type || "").trim().toLowerCase()).filter(Boolean));

  const disabledRaw = Array.isArray(tenant.disabledServices) ? tenant.disabledServices : [];
  const disabled = new Set(
    disabledRaw
      .map((s) => normalizeServiceType(s))
      .map((s) => String(s || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const normalizedQueryServiceType = normalizeServiceType(serviceType);
  if (normalizedQueryServiceType && disabled.has(normalizedQueryServiceType)) {
    return res.json({ data: { tenant: { slug: tenant.slug }, plans: [] } });
  }
  if (normalizedQueryServiceType && !enabledTypes.has(normalizedQueryServiceType)) {
    return res.json({ data: { tenant: { slug: tenant.slug }, plans: [] } });
  }

  const q = { active: true };
  if (normalizedQueryServiceType) {
    q.serviceType = normalizedQueryServiceType;
  } else {
    q.serviceType = { $in: Array.from(enabledTypes).filter((t) => !disabled.has(t)) };
  }

  const plans = await ServicePlan.find(q)
    .select("name validity category serviceType network ourPrice subServiceId")
    .limit(limit)
    .lean();

  const planIds = plans.map((p) => p._id);
  const overrides = await TenantPlanPrice.find({
    tenantId: tenant._id,
    userId: null,
    planId: { $in: planIds },
    active: true,
  })
    .select("planId pricingType value active")
    .lean();

  const map = new Map(overrides.map((o) => [String(o.planId), o]));

  const data = plans.map((p) => {
    const basePrice = Number(p.ourPrice || 0);
    const override = map.get(String(p._id));
    const sellingPrice = computeSellingPrice(basePrice, override);
    return {
      planId: p._id,
      name: p.name,
      validity: p.validity || null,
      category: p.category || null,
      serviceType: p.serviceType,
      network: p.network,
      basePrice: Number.isFinite(basePrice) ? basePrice : null,
      sellingPrice,
      pricingType: override?.pricingType || null,
      pricingValue: typeof override?.value === "number" ? override.value : null,
    };
  });

  return res.json({ data: { tenant: { slug: tenant.slug }, plans: data } });
});

const onboardMerchant = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: "Not authorized" });

  const body = req.body || {};
  const slug = normalizeSlug(body.slug);
  if (!isValidSlug(slug)) {
    return res
      .status(400)
      .json({ error: "Invalid slug. Use 3-30 chars: letters, numbers, hyphen." });
  }

  const existingSlug = await Tenant.findOne({ slug }).select("_id");
  if (existingSlug) {
    return res.status(409).json({ error: "Slug already taken" });
  }

  const tenant = await Tenant.create({
    ownerUserId: userId,
    slug,
    status: "active",
    brandName: body.brandName || null,
    logoUrl: body.logoUrl || null,
    primaryColor: body.primaryColor || null,
    supportEmail: body.supportEmail || null,
    supportPhone: body.supportPhone || null,
  });

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId },
    { $set: { role: "merchant", tenantId: tenant._id } },
    { new: true }
  ).select("email role tenantId");

  if (!updatedUser) return res.status(404).json({ error: "User not found" });

  await RefreshToken.deleteMany({ userId: updatedUser._id });
  const accessToken = signAccessToken({
    id: updatedUser._id,
    role: updatedUser.role,
    email: updatedUser.email,
  });
  const refreshToken = signRefreshToken({ id: updatedUser._id });

  await RefreshToken.create({
    token: refreshToken,
    userId: updatedUser._id,
    expiresAt: refreshExpDate(),
    createdByIp: req.ip,
  });

  await User.updateOne({ _id: updatedUser._id }, { $set: { currentToken: accessToken } });

  return res.status(201).json({
    data: {
      tenantId: tenant._id,
      slug: tenant.slug,
      status: tenant.status,
      brandName: tenant.brandName || null,
      logoUrl: tenant.logoUrl || null,
      primaryColor: tenant.primaryColor || null,
      supportEmail: tenant.supportEmail || null,
      supportPhone: tenant.supportPhone || null,
    },
    accessToken,
    refreshToken,
    user: {
      id: updatedUser._id,
      email: updatedUser.email,
      role: updatedUser.role,
    },
  });
});

const getMyTenant = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: "Not authorized" });

  const tenantQuery = req.user?.tenantId ? { _id: req.user.tenantId } : { ownerUserId: userId };
  const tenant = await Tenant.findOne(tenantQuery).select(
    "slug status brandName logoUrl primaryColor supportEmail supportPhone disabledServices riskSettings createdAt updatedAt"
  );
  if (!tenant) return res.status(404).json({ error: "Merchant profile not found" });

  return res.json({ data: tenant });
});

const updateMyTenant = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const body = req.body || {};
  const update = {};

  const fields = ["brandName", "logoUrl", "primaryColor", "supportEmail", "supportPhone"];
  for (const f of fields) {
    if (!(f in body)) continue;
    const v = body[f];
    if (typeof v === "string") {
      const trimmed = v.trim();
      update[f] = trimmed ? trimmed : null;
      continue;
    }
    if (v === null) {
      update[f] = null;
    }
  }

  if ("disabledServices" in body) {
    const allowed = ["airtime", "data", "electricity", "cable", "exam"];
    const input = Array.isArray(body.disabledServices) ? body.disabledServices : [];
    update.disabledServices = Array.from(
      new Set(
        input
          .map((s) => normalizeServiceType(s))
          .map((s) => String(s || "").trim().toLowerCase())
          .filter((s) => allowed.includes(s))
      )
    );
  }

  if ("riskSettings" in body) {
    const rs = body.riskSettings || {};

    if (typeof rs.pinRequired === "boolean") update["riskSettings.pinRequired"] = rs.pinRequired;

    const safeInt = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.trunc(n);
    };
    const safeNumOrNull = (v) => {
      if (v === null) return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return n;
    };

    if ("velocityWindowMinutes" in rs) {
      const n = safeInt(rs.velocityWindowMinutes);
      if (n !== null && n >= 1 && n <= 60) update["riskSettings.velocityWindowMinutes"] = n;
    }
    if ("velocityMaxTx" in rs) {
      const n = safeInt(rs.velocityMaxTx);
      if (n !== null && n >= 1 && n <= 100) update["riskSettings.velocityMaxTx"] = n;
    }

    if ("dailyAmountLimitUnverified" in rs) {
      const n = safeNumOrNull(rs.dailyAmountLimitUnverified);
      if (n === null || (n >= 0 && n <= 100000000)) update["riskSettings.dailyAmountLimitUnverified"] = n;
    }
    if ("dailyTxLimitUnverified" in rs) {
      const n = safeNumOrNull(rs.dailyTxLimitUnverified);
      if (n === null || (n >= 0 && n <= 100000)) update["riskSettings.dailyTxLimitUnverified"] = n;
    }
    if ("dailyAmountLimitVerified" in rs) {
      const n = safeNumOrNull(rs.dailyAmountLimitVerified);
      if (n === null || (n >= 0 && n <= 100000000)) update["riskSettings.dailyAmountLimitVerified"] = n;
    }
    if ("dailyTxLimitVerified" in rs) {
      const n = safeNumOrNull(rs.dailyTxLimitVerified);
      if (n === null || (n >= 0 && n <= 100000)) update["riskSettings.dailyTxLimitVerified"] = n;
    }
    if ("kycRequiredAbove" in rs) {
      const n = safeNumOrNull(rs.kycRequiredAbove);
      if (n === null || (n >= 0 && n <= 100000000)) update["riskSettings.kycRequiredAbove"] = n;
    }

    const alerts = rs.alerts || {};
    if ("failedTransactions" in alerts && typeof alerts.failedTransactions === "boolean") {
      update["riskSettings.alerts.failedTransactions"] = alerts.failedTransactions;
    }
    if ("email" in alerts && typeof alerts.email === "boolean") {
      update["riskSettings.alerts.email"] = alerts.email;
    }
  }

  const tenant = await Tenant.findOneAndUpdate(
    { _id: tenantId },
    { $set: update },
    { new: true }
  ).select(
    "slug status brandName logoUrl primaryColor supportEmail supportPhone disabledServices riskSettings createdAt updatedAt"
  );

  if (!tenant) return res.status(404).json({ error: "Merchant profile not found" });

  if (Object.keys(update).length) {
    await createUserAuditLog({
      req,
      tenantId,
      module: "settings",
      action: "tenant.update",
      description: "Updated merchant settings",
      metadata: { keys: Object.keys(update) },
    });
  }

  return res.json({ data: tenant });
});

const getMyTenantContext = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: "Not authorized" });

  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.json({ data: { tenant: null } });

  const tenant = await Tenant.findOne({ _id: tenantId, status: "active" }).select(
    "slug status brandName logoUrl primaryColor supportEmail supportPhone disabledServices riskSettings"
  );

  if (!tenant) return res.json({ data: { tenant: null } });

  return res.json({
    data: {
      tenant: {
        tenantId: tenant._id,
        slug: tenant.slug,
        brandName: tenant.brandName || null,
        logoUrl: tenant.logoUrl || null,
        primaryColor: tenant.primaryColor || null,
        supportEmail: tenant.supportEmail || null,
        supportPhone: tenant.supportPhone || null,
        disabledServices: Array.isArray(tenant.disabledServices) ? tenant.disabledServices : [],
        riskSettings: tenant.riskSettings || null,
      },
    },
  });
});

const getMyPlanPrices = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const rows = await TenantPlanPrice.find({ tenantId, userId: null })
    .select("planId pricingType value active createdAt updatedAt")
    .lean();

  return res.json({ data: rows });
});

const getMyCustomers = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const role = String(req.query.role || "").trim().toLowerCase();
  const search = String(req.query.search || "").trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "100"), 10) || 100, 1), 500);

  const q = { tenantId };
  if (role && role !== "all") {
    q.role = role;
  } else {
    q.role = { $in: ["user", "agent"] };
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [{ email: rx }, { phone: rx }, { firstName: rx }, { lastName: rx }];
  }

  const users = await User.find(q)
    .select("firstName lastName email phone role status kycStatus kycLevel kycVerifiedAt createdAt lastLogin")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.json({ data: users });
});

const getMyTransactions = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 200);
  const skip = (page - 1) * limit;

  const type = String(req.query.type || "").trim().toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();
  const search = String(req.query.search || "").trim();

  const startDateRaw = String(req.query.startDate || "").trim();
  const endDateRaw = String(req.query.endDate || "").trim();
  const startDate = startDateRaw ? new Date(startDateRaw) : null;
  const endDate = endDateRaw ? new Date(endDateRaw) : null;

  const q = { tenantId };
  if (type && type !== "all") q.service = type;
  if (status && status !== "all") q.status = status;

  if (startDate && Number.isFinite(startDate.getTime())) {
    q.createdAt = {
      ...(q.createdAt || {}),
      $gte: startDate,
    };
  }
  if (endDate && Number.isFinite(endDate.getTime())) {
    q.createdAt = {
      ...(q.createdAt || {}),
      $lte: endDate,
    };
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const userIds = await User.find({
      tenantId,
      $or: [{ email: rx }, { phone: rx }, { firstName: rx }, { lastName: rx }],
    })
      .select("_id")
      .limit(2000)
      .lean();

    const ids = userIds.map((u) => u._id);
    q.$or = [
      { reference_no: rx },
      { provider_reference: rx },
      { mobile_no: rx },
      { meter_no: rx },
      { iucno: rx },
      ...(ids.length ? [{ userId: { $in: ids } }] : []),
    ];
  }

  const totalTransactions = await Transaction.countDocuments(q);
  const transactions = await Transaction.find(q)
    .populate("userId", "firstName lastName email phone")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return res.json({
    success: true,
    currentPage: page,
    totalPages: Math.ceil(totalTransactions / limit) || 1,
    totalTransactions,
    transactions,
  });
});

const getMyCustomer = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "User is required" });

  const u = await User.findOne({ _id: userId, tenantId })
    .select(
      "firstName lastName email phone role status balance kycStatus kycLevel kycVerifiedAt kycNotes createdAt lastLogin"
    )
    .lean();

  if (!u) return res.status(404).json({ error: "User not found" });
  return res.json({ data: u });
});

const getMyCustomerTransactions = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "User is required" });

  const userExists = await User.findOne({ _id: userId, tenantId }).select("_id").lean();
  if (!userExists) return res.status(404).json({ error: "User not found" });

  const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 200);
  const skip = (page - 1) * limit;

  const totalTransactions = await Transaction.countDocuments({ tenantId, userId });
  const transactions = await Transaction.find({ tenantId, userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return res.json({
    success: true,
    currentPage: page,
    totalPages: Math.ceil(totalTransactions / limit) || 1,
    totalTransactions,
    transactions,
  });
});

const updateMyCustomerKyc = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "User is required" });

  const body = req.body || {};
  const update = {};

  const allowed = ["unverified", "pending", "verified", "rejected"];
  if ("kycStatus" in body) {
    const next = String(body.kycStatus || "").trim().toLowerCase();
    if (!allowed.includes(next)) return res.status(400).json({ error: "Invalid kycStatus" });
    update.kycStatus = next;
    if (next === "verified") {
      update.kycVerifiedAt = new Date();
      update.kycRejectedAt = null;
    }
    if (next === "rejected") {
      update.kycRejectedAt = new Date();
      update.kycVerifiedAt = null;
    }
    if (next === "pending" || next === "unverified") {
      update.kycVerifiedAt = null;
      update.kycRejectedAt = null;
    }
  }

  if ("kycLevel" in body) {
    const n = Number(body.kycLevel);
    if (!Number.isFinite(n) || n < 0 || n > 10) return res.status(400).json({ error: "Invalid kycLevel" });
    update.kycLevel = Math.trunc(n);
  }

  if ("kycNotes" in body) {
    const v = body.kycNotes;
    if (v === null) update.kycNotes = null;
    if (typeof v === "string") update.kycNotes = v.trim() || null;
  }

  if (!Object.keys(update).length) return res.status(400).json({ error: "No changes provided" });

  const u = await User.findOneAndUpdate({ _id: userId, tenantId }, { $set: update }, { new: true }).select(
    "firstName lastName email phone role status balance kycStatus kycLevel kycVerifiedAt kycNotes createdAt lastLogin"
  );

  if (!u) return res.status(404).json({ error: "User not found" });

  await createUserAuditLog({
    req,
    tenantId,
    module: "kyc",
    action: "customer.kyc.update",
    description: "Updated customer KYC status",
    metadata: { userId: String(u._id), update },
  });

  return res.json({ data: u });
});

const updateMyCustomerStatus = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "User is required" });

  const nextStatus = String(req.body?.status || "").trim().toLowerCase();
  if (!["active", "suspended"].includes(nextStatus)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const u = await User.findOneAndUpdate(
    { _id: userId, tenantId },
    { $set: { status: nextStatus } },
    { new: true }
  ).select("firstName lastName email phone role status kycStatus kycLevel createdAt lastLogin balance");

  if (!u) return res.status(404).json({ error: "User not found" });

  await createUserAuditLog({
    req,
    tenantId,
    module: "risk",
    action: "customer.status.update",
    description: "Updated customer status",
    metadata: { userId: String(u._id), status: nextStatus },
  });

  return res.json({ data: u });
});

const getMyAuditLogs = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 200);
  const skip = (page - 1) * limit;

  const module = String(req.query.module || "").trim();
  const action = String(req.query.action || "").trim();

  const q = { tenantId };
  if (module) q.module = module;
  if (action) q.action = action;

  const totalLogs = await ActivityLog.countDocuments(q);
  const logs = await ActivityLog.find(q).sort({ timestamp: -1 }).skip(skip).limit(limit).lean();

  return res.json({
    data: logs,
    currentPage: page,
    totalPages: Math.ceil(totalLogs / limit) || 1,
    totalLogs,
  });
});

const getMyDashboard = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const filter = String(req.query.filter || "all").trim().toLowerCase();
  const now = new Date();
  let start = null;

  if (filter === "day") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (filter === "week") {
    start = new Date(now);
    start.setDate(start.getDate() - 7);
  } else if (filter === "month") {
    start = new Date(now);
    start.setDate(start.getDate() - 30);
  } else if (filter === "year") {
    start = new Date(now);
    start.setDate(start.getDate() - 365);
  }

  const match = { tenantId };
  if (start) {
    match.createdAt = { $gte: start };
  }

  const totalsAgg = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        successCount: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
        failedCount: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        totalSelling: {
          $sum: {
            $ifNull: ["$selling_price", { $ifNull: ["$amount", 0] }],
          },
        },
        totalProfit: {
          $sum: {
            $ifNull: [
              "$merchant_profit",
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$selling_price", null] },
                      { $ne: ["$platform_price", null] },
                    ],
                  },
                  { $subtract: ["$selling_price", "$platform_price"] },
                  0,
                ],
              },
            ],
          },
        },
      },
    },
  ]);

  const totals = totalsAgg[0] || {
    totalTransactions: 0,
    successCount: 0,
    failedCount: 0,
    totalSelling: 0,
    totalProfit: 0,
  };

  const topServices = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$service",
        count: { $sum: 1 },
        selling: {
          $sum: {
            $ifNull: ["$selling_price", { $ifNull: ["$amount", 0] }],
          },
        },
        profit: {
          $sum: {
            $ifNull: [
              "$merchant_profit",
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$selling_price", null] },
                      { $ne: ["$platform_price", null] },
                    ],
                  },
                  { $subtract: ["$selling_price", "$platform_price"] },
                  0,
                ],
              },
            ],
          },
        },
      },
    },
    { $sort: { profit: -1 } },
    { $limit: 10 },
    {
      $project: {
        _id: 0,
        service: "$_id",
        count: 1,
        selling: 1,
        profit: 1,
      },
    },
  ]);

  const recentTransactions = await Transaction.find(match)
    .populate("userId", "firstName lastName email phone")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return res.json({
    data: {
      totals,
      topServices,
      recentTransactions,
    },
  });
});

const upsertMyPlanPrices = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "No pricing items provided" });

  const writes = [];
  for (const it of items) {
    const planId = it?.planId;
    const pricingType = String(it?.pricingType || "").trim();
    const value = Number(it?.value);
    const active = typeof it?.active === "boolean" ? it.active : true;

    if (!planId) continue;
    if (!["fixed", "flat_markup", "percent_markup"].includes(pricingType)) continue;
    if (!Number.isFinite(value)) continue;

    writes.push({
      updateOne: {
        filter: { tenantId, userId: null, planId },
        update: { $set: { tenantId, userId: null, planId, pricingType, value, active } },
        upsert: true,
      },
    });
  }

  if (!writes.length) return res.status(400).json({ error: "No valid pricing items provided" });

  await TenantPlanPrice.bulkWrite(writes);
  await createUserAuditLog({
    req,
    tenantId,
    module: "pricing",
    action: "pricing.update",
    description: "Updated tenant pricing overrides",
    metadata: { count: writes.length },
  });
  return res.json({ success: true });
});

async function resolveTenantUser(req, res) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ error: "Merchant profile not found" });
    return null;
  }

  const userId = String(req.params.userId || "").trim();
  if (!userId) {
    res.status(400).json({ error: "User is required" });
    return null;
  }

  const u = await User.findOne({ _id: userId, tenantId }).select("_id role email");
  if (!u) {
    res.status(404).json({ error: "User not found" });
    return null;
  }

  return { tenantId, userId: u._id, userRole: u.role, userEmail: u.email };
}

const getUserPlanPrices = asyncHandler(async (req, res) => {
  const ctx = await resolveTenantUser(req, res);
  if (!ctx) return;

  const rows = await TenantPlanPrice.find({ tenantId: ctx.tenantId, userId: ctx.userId })
    .select("planId pricingType value active createdAt updatedAt")
    .lean();

  return res.json({ data: rows });
});

const upsertUserPlanPrices = asyncHandler(async (req, res) => {
  const ctx = await resolveTenantUser(req, res);
  if (!ctx) return;

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "No pricing items provided" });

  const writes = [];
  for (const it of items) {
    const planId = it?.planId;
    const pricingType = String(it?.pricingType || "").trim();
    const value = Number(it?.value);
    const active = typeof it?.active === "boolean" ? it.active : true;

    if (!planId) continue;
    if (!["fixed", "flat_markup", "percent_markup"].includes(pricingType)) continue;
    if (!Number.isFinite(value)) continue;

    writes.push({
      updateOne: {
        filter: { tenantId: ctx.tenantId, userId: ctx.userId, planId },
        update: { $set: { tenantId: ctx.tenantId, userId: ctx.userId, planId, pricingType, value, active } },
        upsert: true,
      },
    });
  }

  if (!writes.length) return res.status(400).json({ error: "No valid pricing items provided" });

  await TenantPlanPrice.bulkWrite(writes);
  await createUserAuditLog({
    req,
    tenantId: ctx.tenantId,
    module: "pricing",
    action: "pricing.user.update",
    description: "Updated user-specific pricing overrides",
    metadata: { userId: String(ctx.userId), count: writes.length },
  });
  return res.json({ success: true });
});

const getMyPricingCatalog = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: "Merchant profile not found" });

  let { network, category, limit, serviceType } = req.query;
  if (!network || !category) {
    return res.status(400).json({ error: "Both 'network' and 'category' are required" });
  }

  const normalizedNetwork = String(network).toLowerCase().trim();
  const normalizedCategory = String(category).toLowerCase().trim();
  const normalizedServiceType = normalizeServiceType(serviceType);

  const enabledTypesRows = await Service.find({ status: true }).select("type -_id").lean();
  const enabledTypes = new Set((enabledTypesRows || []).map((r) => String(r.type || "").trim().toLowerCase()).filter(Boolean));
  if (normalizedServiceType && !enabledTypes.has(normalizedServiceType)) {
    return res.json({ data: [] });
  }

  const networkCodes = resolveNetworkCodes(normalizedNetwork);
  if (!networkCodes) {
    return res.status(400).json({
      error: "Invalid network",
    });
  }

  const safeLimit = Math.min(Math.max(parseInt(String(limit || "200"), 10) || 200, 1), 500);

  const q = {
    network: { $in: networkCodes },
    category: { $regex: `^${normalizedCategory}$`, $options: "i" },
    active: true,
  };
  if (normalizedServiceType) {
    q.serviceType = { $regex: `^${normalizedServiceType}$`, $options: "i" };
  } else {
    q.serviceType = { $in: Array.from(enabledTypes) };
  }

  const plans = await ServicePlan.find(q)
    .select("name validity category serviceType network ourPrice subServiceId")
    .limit(safeLimit)
    .lean();

  const planIds = plans.map((p) => p._id);
  const overrides = await TenantPlanPrice.find({
    tenantId,
    userId: null,
    planId: { $in: planIds },
  })
    .select("planId pricingType value active updatedAt")
    .lean();

  const map = new Map(overrides.map((o) => [String(o.planId), o]));

  const data = plans.map((p) => {
    const rawBase = Number(p.ourPrice);
    const basePrice = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : null;
    const override = map.get(String(p._id)) || null;
    const sellingPrice = basePrice === null ? null : computeSellingPrice(basePrice, override);
    return {
      planId: p._id,
      name: p.name,
      validity: p.validity || null,
      category: p.category || null,
      serviceType: p.serviceType,
      network: p.network,
      basePrice,
      sellingPrice,
      override: override
        ? {
            pricingType: override.pricingType,
            value: override.value,
            active: override.active,
            updatedAt: override.updatedAt,
          }
        : null,
    };
  });

  return res.json({ data });
});

const getUserPricingCatalog = asyncHandler(async (req, res) => {
  const ctx = await resolveTenantUser(req, res);
  if (!ctx) return;

  let { network, category, limit, serviceType } = req.query;
  if (!network || !category) {
    return res.status(400).json({ error: "Both 'network' and 'category' are required" });
  }

  const normalizedNetwork = String(network).toLowerCase().trim();
  const normalizedCategory = String(category).toLowerCase().trim();
  const normalizedServiceType = normalizeServiceType(serviceType);

  const enabledTypesRows = await Service.find({ status: true }).select("type -_id").lean();
  const enabledTypes = new Set((enabledTypesRows || []).map((r) => String(r.type || "").trim().toLowerCase()).filter(Boolean));
  if (normalizedServiceType && !enabledTypes.has(normalizedServiceType)) {
    return res.json({ data: [] });
  }

  const networkCodes = resolveNetworkCodes(normalizedNetwork);
  if (!networkCodes) {
    return res.status(400).json({
      error: "Invalid network",
    });
  }

  const safeLimit = Math.min(Math.max(parseInt(String(limit || "200"), 10) || 200, 1), 500);

  const q = {
    network: { $in: networkCodes },
    category: { $regex: `^${normalizedCategory}$`, $options: "i" },
    active: true,
  };
  if (normalizedServiceType) {
    q.serviceType = { $regex: `^${normalizedServiceType}$`, $options: "i" };
  } else {
    q.serviceType = { $in: Array.from(enabledTypes) };
  }

  const plans = await ServicePlan.find(q)
    .select("name validity category serviceType network ourPrice subServiceId")
    .limit(safeLimit)
    .lean();

  const planIds = plans.map((p) => p._id);
  const userOverrides = await TenantPlanPrice.find({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    planId: { $in: planIds },
  })
    .select("planId pricingType value active updatedAt")
    .lean();

  const tenantOverrides = await TenantPlanPrice.find({
    tenantId: ctx.tenantId,
    userId: null,
    planId: { $in: planIds },
  })
    .select("planId pricingType value active updatedAt")
    .lean();

  const userMap = new Map(userOverrides.map((o) => [String(o.planId), o]));
  const tenantMap = new Map(tenantOverrides.map((o) => [String(o.planId), o]));

  const data = plans.map((p) => {
    const rawBase = Number(p.ourPrice);
    const basePrice = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : null;
    const uo = userMap.get(String(p._id)) || null;
    const to = tenantMap.get(String(p._id)) || null;
    const effectiveOverride = uo || to;
    const sellingPrice = basePrice === null ? null : computeSellingPrice(basePrice, effectiveOverride);
    return {
      planId: p._id,
      name: p.name,
      validity: p.validity || null,
      category: p.category || null,
      serviceType: p.serviceType,
      network: p.network,
      basePrice,
      sellingPrice,
      overrideLevel: uo ? "user" : to ? "tenant" : null,
      userOverride: uo
        ? { pricingType: uo.pricingType, value: uo.value, active: uo.active, updatedAt: uo.updatedAt }
        : null,
      tenantOverride: to
        ? { pricingType: to.pricingType, value: to.value, active: to.active, updatedAt: to.updatedAt }
        : null,
    };
  });

  return res.json({ data });
});

module.exports = {
  getPublicTenantBranding,
  getPublicTenantPlans,
  onboardMerchant,
  getMyTenant,
  updateMyTenant,
  getMyTenantContext,
  getMyPlanPrices,
  getMyCustomers,
  getMyTransactions,
  getMyCustomer,
  getMyCustomerTransactions,
  updateMyCustomerKyc,
  updateMyCustomerStatus,
  getMyAuditLogs,
  getMyDashboard,
  upsertMyPlanPrices,
  getMyPricingCatalog,
  getUserPlanPrices,
  upsertUserPlanPrices,
  getUserPricingCatalog,
};
