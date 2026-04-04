const mongoose = require("mongoose");
require("dotenv").config();

const Service = require("../models/servicesModel");
const SubService = require("../models/subServicesModel");
const ServicePlan = require("../models/servicePlanModel");
const CategoryProvider = require("../models/testingCategoryProviderModel");
const { NETWORK_CATALOG_CODES } = require("../utils/networkCatalog");

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is required");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const servicesSeed = [
    { type: "data", name: "Data", description: "Data subscription", status: true },
    { type: "airtime", name: "Airtime", description: "Airtime recharge", status: true },
    { type: "electricity", name: "Electricity", description: "Electricity bills", status: true },
    { type: "cable", name: "Cable TV", description: "Cable TV subscriptions", status: true },
    { type: "exam", name: "Exam Pins", description: "Exam PIN purchases", status: true },
  ];

  const serviceByType = new Map();
  for (const s of servicesSeed) {
    const doc = await Service.findOneAndUpdate(
      { type: s.type },
      { $set: { name: s.name, description: s.description, status: s.status, type: s.type } },
      { upsert: true, new: true }
    );
    serviceByType.set(s.type, doc);
  }

  const dataService = serviceByType.get("data");
  const airtimeService = serviceByType.get("airtime");
  const electricityService = serviceByType.get("electricity");
  const cableService = serviceByType.get("cable");
  const examService = serviceByType.get("exam");

  const subServicesSeed = [
    { serviceId: dataService._id, name: "MTN Data", code: "mtn-data", type: "data", provider: "easyaccess", status: true },
    { serviceId: dataService._id, name: "Airtel Data", code: "airtel-data", type: "data", provider: "easyaccess", status: true },
    { serviceId: dataService._id, name: "9mobile Data", code: "9mobile-data", type: "data", provider: "easyaccess", status: true },
    { serviceId: dataService._id, name: "Glo Data", code: "glo-data", type: "data", provider: "easyaccess", status: true },

    { serviceId: airtimeService._id, name: "MTN Airtime", code: "mtn-airtime", type: "airtime", provider: "easyaccess", status: true },
    { serviceId: airtimeService._id, name: "Airtel Airtime", code: "airtel-airtime", type: "airtime", provider: "easyaccess", status: true },
    { serviceId: airtimeService._id, name: "9mobile Airtime", code: "9mobile-airtime", type: "airtime", provider: "easyaccess", status: true },
    { serviceId: airtimeService._id, name: "Glo Airtime", code: "glo-airtime", type: "airtime", provider: "easyaccess", status: true },

    { serviceId: electricityService._id, name: "Ikeja Electric", code: "ikeja-electric", type: "electricity", provider: "easyaccess", status: true },
    { serviceId: electricityService._id, name: "Eko Electric", code: "eko-electric", type: "electricity", provider: "easyaccess", status: true },
    { serviceId: electricityService._id, name: "Abuja Electric", code: "abuja-electric", type: "electricity", provider: "easyaccess", status: true },

    { serviceId: cableService._id, name: "GOtv", code: "gotv", type: "cable", provider: "easyaccess", status: true },
    { serviceId: cableService._id, name: "DStv", code: "dstv", type: "cable", provider: "easyaccess", status: true },
    { serviceId: cableService._id, name: "Startimes", code: "startime", type: "cable", provider: "easyaccess", status: true },

    { serviceId: examService._id, name: "WAEC", code: "waec", type: "exam", provider: "easyaccess", status: true },
    { serviceId: examService._id, name: "NECO", code: "neco", type: "exam", provider: "easyaccess", status: true },
    { serviceId: examService._id, name: "NABTEB", code: "nabteb", type: "exam", provider: "easyaccess", status: true },
  ];

  const subServiceByCode = new Map();
  for (const s of subServicesSeed) {
    const doc = await SubService.findOneAndUpdate(
      { code: s.code },
      {
        $set: {
          serviceId: s.serviceId,
          name: s.name,
          code: s.code,
          type: s.type,
          provider: s.provider,
          status: s.status,
        },
      },
      { upsert: true, new: true }
    );
    subServiceByCode.set(s.code, doc);
  }

  const networkCodes = Object.fromEntries(
    Object.entries(NETWORK_CATALOG_CODES).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  function makePlanKey(p) {
    return [
      p.serviceType,
      p.subCode,
      p.category,
      p.name,
      p.validity,
      p.network,
    ]
      .map((x) => String(x || "").trim().toLowerCase())
      .filter(Boolean)
      .join("|");
  }

  const plansSeed = [
    { subCode: "mtn-data", name: "500MB", category: "SME", validity: "30 Days", serviceType: "data", network: networkCodes.mtn, ourPrice: 300, active: true },
    { subCode: "mtn-data", name: "1GB", category: "SME", validity: "30 Days", serviceType: "data", network: networkCodes.mtn, ourPrice: 500, active: true },
    { subCode: "mtn-data", name: "2GB", category: "SME", validity: "30 Days", serviceType: "data", network: networkCodes.mtn, ourPrice: 950, active: true },

    { subCode: "airtel-data", name: "500MB", category: "SME", validity: "30 Days", serviceType: "data", network: networkCodes.airtel, ourPrice: 280, active: true },
    { subCode: "airtel-data", name: "1GB", category: "SME", validity: "30 Days", serviceType: "data", network: networkCodes.airtel, ourPrice: 480, active: true },

    { subCode: "9mobile-data", name: "500MB", category: "SME", validity: "30 Days", serviceType: "data", network: networkCodes["9mobile"], ourPrice: 290, active: true },
    { subCode: "9mobile-data", name: "1GB", category: "SME", validity: "30 Days", serviceType: "data", network: networkCodes["9mobile"], ourPrice: 490, active: true },

    { subCode: "glo-data", name: "500MB", category: "SME", validity: "30 Days", serviceType: "data", network: networkCodes.glo, ourPrice: 260, active: true },
    { subCode: "glo-data", name: "1GB", category: "SME", validity: "30 Days", serviceType: "data", network: networkCodes.glo, ourPrice: 460, active: true },

    { subCode: "gotv", name: "GOtv Smallie", category: "VTU", validity: "30 Days", serviceType: "cable", network: networkCodes.gotv, ourPrice: 1500, planKind: "fixed", active: true },
    { subCode: "dstv", name: "DStv Compact", category: "VTU", validity: "30 Days", serviceType: "cable", network: networkCodes.dstv, ourPrice: 10500, planKind: "fixed", active: true },
    { subCode: "startime", name: "Startimes Basic", category: "VTU", validity: "30 Days", serviceType: "cable", network: networkCodes.startime, ourPrice: 3300, planKind: "fixed", active: true },

    { subCode: "ikeja-electric", name: "Electricity Token", category: "VTU", validity: "Instant", serviceType: "electricity", network: networkCodes.ikejaelectric, ourPrice: null, planKind: "variable", active: true },
    { subCode: "eko-electric", name: "Electricity Token", category: "VTU", validity: "Instant", serviceType: "electricity", network: networkCodes.ekoelectric, ourPrice: null, planKind: "variable", active: true },
    { subCode: "abuja-electric", name: "Electricity Token", category: "VTU", validity: "Instant", serviceType: "electricity", network: networkCodes.abujaelectric, ourPrice: null, planKind: "variable", active: true },

    { subCode: "waec", name: "WAEC PIN", category: "VTU", validity: "Instant", serviceType: "exam", network: networkCodes.waec, ourPrice: 3500, planKind: "fixed", active: true },
    { subCode: "neco", name: "NECO PIN", category: "VTU", validity: "Instant", serviceType: "exam", network: networkCodes.neco, ourPrice: 1300, planKind: "fixed", active: true },
    { subCode: "nabteb", name: "NABTEB PIN", category: "VTU", validity: "Instant", serviceType: "exam", network: networkCodes.nabteb, ourPrice: 1100, planKind: "fixed", active: true },
  ];

  let upsertedPlans = 0;
  for (const p of plansSeed) {
    const sub = subServiceByCode.get(p.subCode);
    if (!sub) continue;
    await ServicePlan.updateOne(
      {
        subServiceId: sub._id,
        name: p.name,
        category: p.category,
        serviceType: p.serviceType,
        network: p.network,
      },
      {
        $set: {
          subServiceId: sub._id,
          subCode: p.subCode,
          name: p.name,
          validity: p.validity,
          category: p.category,
          serviceType: p.serviceType,
          network: p.network,
          ourPrice: p.ourPrice,
          planKey: makePlanKey(p),
          planKind: p.planKind || "fixed",
          active: p.active,
        },
      },
      { upsert: true }
    );
    upsertedPlans += 1;
  }

  const dataNetworkNameForSubCode = (subCode) => {
    const key = String(subCode || "").split("-")[0].toLowerCase();
    if (key === "mtn") return "MTN";
    if (key === "airtel") return "AIRTEL";
    if (key === "glo") return "GLO";
    if (key === "9mobile") return "9MOBILE";
    return String(key || "").toUpperCase();
  };

  const dataCategoryProvidersSeed = [
    { category: "SME", provider: "easyaccess", status: true },
    { category: "GIFTING", provider: "easyaccess", status: true },
    { category: "CORPORATE", provider: "easyaccess", status: true },
  ];

  let upsertedCategories = 0;
  for (const subCode of ["mtn-data", "airtel-data", "glo-data", "9mobile-data"]) {
    const sub = subServiceByCode.get(subCode);
    if (!sub) continue;
    const networkName = dataNetworkNameForSubCode(subCode);

    for (const c of dataCategoryProvidersSeed) {
      await CategoryProvider.findOneAndUpdate(
        { subServiceId: sub._id, network: networkName, category: c.category },
        {
          $set: {
            subServiceId: sub._id,
            network: networkName,
            category: c.category,
            provider: c.provider,
            status: c.status,
          },
        },
        { upsert: true, new: true }
      );
      upsertedCategories += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        services: servicesSeed.length,
        subServices: subServicesSeed.length,
        servicePlans: upsertedPlans,
        categories: upsertedCategories,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

