const asyncHandler = require("express-async-handler");
const Config = require("../models/configModel");

async function getConfig(type) {
  let cfg = await Config.findOne({ type });
  if (!cfg) {
    cfg = new Config({ type, data: {} });
    await cfg.save();
  }
  return cfg;
}

const getBrandConfig = asyncHandler(async (req, res) => {
  const cfg = await getConfig("branding");
  res.json({ data: cfg.data });
});

const updateBrandConfig = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const cfg = await getConfig("branding");
  cfg.data = {
    brandName: body.brandName || cfg.data.brandName || process.env.BRAND_NAME || null,
    supportEmail: body.supportEmail || cfg.data.supportEmail || null,
    supportPhone: body.supportPhone || cfg.data.supportPhone || null,
    primaryColor: body.primaryColor || cfg.data.primaryColor || null,
    logoUrl: body.logoUrl || cfg.data.logoUrl || null,
  };
  await cfg.save();
  res.json({ success: true, data: cfg.data });
});

const getPublicBranding = asyncHandler(async (req, res) => {
  const cfg = await getConfig("branding");
  const d = cfg.data || {};
  res.json({
    data: {
      brandName: d.brandName || null,
      supportEmail: d.supportEmail || null,
      supportPhone: d.supportPhone || null,
      primaryColor: d.primaryColor || null,
      logoUrl: d.logoUrl || null,
    },
  });
});

const getProviderConfig = asyncHandler(async (req, res) => {
  const cfg = await getConfig("providers");
  const safe = { ...cfg.data };
  if (safe.vtpass) delete safe.vtpass;
  if (safe.easyAccess && safe.easyAccess.apiKey) safe.easyAccess.apiKey = true;
  if (safe.autopilot && safe.autopilot.apiKey) safe.autopilot.apiKey = true;
  res.json({ data: safe });
});

const updateProviderConfig = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const cfg = await getConfig("providers");
  cfg.data = {
    easyAccess: {
      apiKey: body?.easyAccess?.apiKey || cfg.data?.easyAccess?.apiKey || null,
      baseUrl: body?.easyAccess?.baseUrl || cfg.data?.easyAccess?.baseUrl || null,
    },
    autopilot: {
      apiKey: body?.autopilot?.apiKey || cfg.data?.autopilot?.apiKey || null,
      baseUrl: body?.autopilot?.baseUrl || cfg.data?.autopilot?.baseUrl || null,
    },
  };
  await cfg.save();
  res.json({ success: true });
});

module.exports = {
  getBrandConfig,
  updateBrandConfig,
  getPublicBranding,
  getProviderConfig,
  updateProviderConfig,
};
