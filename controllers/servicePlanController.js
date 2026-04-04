const ServicePlan = require("../models/servicePlanModel");
const Category = require("../models/testingCategoryProviderModel");
const TenantPlanPrice = require("../models/tenantPlanPriceModel");
const { resolveNetworkCodes, normalizeServiceType } = require("../utils/networkCatalog");

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

const getPlansByNetworkAndCategory = async (req, res) => {
  try {
    let { network, category, serviceType } = req.query;

    if (!network || !category) {
      return res.status(400).json({
        success: false,
        message: "Both 'network' and 'category' are required",
      });
    }

    network = network.toLowerCase().trim();
    category = category.toLowerCase().trim();

    const networkCodes = resolveNetworkCodes(network);
    if (!networkCodes) {
      return res.status(400).json({
        success: false,
        message: "Invalid network",
      });
    }

    const normalizedServiceType = normalizeServiceType(serviceType);
    const q = {
      network: { $in: networkCodes },
      category: { $regex: `^${category}$`, $options: "i" },
      active: true,
    };
    if (normalizedServiceType) q.serviceType = { $regex: `^${normalizedServiceType}$`, $options: "i" };

    const plans = await ServicePlan.find(q).lean();

    const tenantId = req.user?.tenantId || req.tenantId;
    if (tenantId && plans.length) {
      const planIds = plans.map((p) => p._id);
      const overrides = await TenantPlanPrice.find({
        tenantId,
        planId: { $in: planIds },
        active: true,
        userId: { $in: [null, req.user?._id || null] },
      })
        .select("planId userId pricingType value active")
        .lean();

      const userMap = new Map(
        overrides
          .filter((o) => o.userId && req.user?._id && String(o.userId) === String(req.user._id))
          .map((o) => [String(o.planId), o])
      );
      const tenantMap = new Map(overrides.filter((o) => !o.userId).map((o) => [String(o.planId), o]));

      for (const p of plans) {
        const rawBase = Number(p.ourPrice);
        const basePrice = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : null;
        const override = userMap.get(String(p._id)) || tenantMap.get(String(p._id));
        const sellingPrice = basePrice === null ? null : computeSellingPrice(basePrice, override);
        if (sellingPrice !== null) p.ourPrice = sellingPrice;
      }
    }

    return res.json({ success: true, plans });
  } catch (err) {
    console.error("Error fetching plans:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getCategoriesByNetwork = async (req, res) => {
  try {
    let { serviceType, network } = req.query;

    // 🧩 Validate inputs
    if (!serviceType || !network) {
      return res.status(400).json({
        success: false,
        message: "Missing serviceType or network",
      });
    }

    // Normalize inputs
    serviceType = normalizeServiceType(serviceType);
    network = network.toLowerCase().trim();

    // 🧩 Validate and map network code
    const networkCodes = resolveNetworkCodes(network);
    if (!networkCodes) {
      return res.status(400).json({
        success: false,
        message: "Invalid network",
      });
    }

    // 🧩 Step 1: Fetch all categories for this network from testingCategoryProvider
    const allCategories = await Category.find({
      network: network.toUpperCase(),
    });

    if (!allCategories.length) {
      return res.status(404).json({
        success: false,
        message: `No categories found for network ${network}`,
      });
    }

    // 🧩 Step 2: Fetch ACTIVE service plans by network + serviceType
    const activePlans = await ServicePlan.find({
      network: { $in: networkCodes },
      serviceType: { $regex: `^${serviceType}$`, $options: "i" },
      active: true,
    });

    if (!activePlans.length) {
      return res.status(404).json({
        success: false,
        message: "No active plans found for this network/service type",
      });
    }

    // 🧩 Step 3: Extract unique category names from active plans
    const activeCategoryNames = [
      ...new Set(
        activePlans
          .map((plan) => plan.category?.toUpperCase().trim())
          .filter(Boolean)
      ),
    ];

    // 🧩 Step 4: Filter categories that are both ACTIVE and match active plans
    const filteredCategories = allCategories.filter(
      (cat) =>
        cat.status === true &&
        activeCategoryNames.includes(cat.category?.toUpperCase().trim())
    );

    // 🧩 Step 6: Return response
    if (!filteredCategories.length) {
      return res.status(404).json({
        success: false,
        message:
          "No active categories found for this network (check status or mapping)",
      });
    }

    return res.status(200).json({
      success: true,
      categories: [...new Set(filteredCategories.map((cat) => cat.category))],
    });
  } catch (err) {
    console.error("❌ Error fetching categories:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const createServicePlan = async (req, res) => {
  try {
    const servicePlan = new ServicePlan(req.body);
    await servicePlan.save();
    res.status(201).json({
      message: "Service plan created successfully",
      data: servicePlan,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// UPDATE
const updateServicePlan = async (req, res) => {
  try {
    const plan = await ServicePlan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ message: "Service plan updated", data: plan });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE
const deleteServicePlan = async (req, res) => {
  try {
    const plan = await ServicePlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ message: "Service plan deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getPlansByNetworkAndCategory,
  getCategoriesByNetwork,
  createServicePlan,
  updateServicePlan,
  deleteServicePlan,
};
