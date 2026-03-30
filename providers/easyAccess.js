const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();
const { generateRequestId } = require("../utils/generateRequestId");
const Config = require("../models/configModel");

let cachedProviders = null;
let cachedProvidersAt = 0;

async function loadProvidersConfig() {
  const now = Date.now();
  if (cachedProviders && now - cachedProvidersAt < 60_000) return cachedProviders;
  try {
    const cfg = await Config.findOne({ type: "providers" }).lean();
    cachedProviders = cfg?.data || {};
    cachedProvidersAt = now;
    return cachedProviders;
  } catch (e) {
    return cachedProviders || {};
  }
}

async function getEasyAccessRuntimeConfig() {
  const p = await loadProvidersConfig();
  const ea = p?.easyAccess || {};
  return {
    baseUrl: ea.baseUrl || process.env.EASYACCESS_BASE_URL,
    apiKey: ea.apiKey || process.env.EASYACCESS_API_KEY,
  };
}

const EasyAccessService = {
  /**
   * Get all available plans for a given product type
   */
  async getPlans(productType) {
    const cfg = await getEasyAccessRuntimeConfig();
    const url = `${cfg.baseUrl}/api/get_plans.php?product_type=${productType}`;

    try {
      const response = await axios.get(url, {
        headers: {
          AuthorizationToken: cfg.apiKey,
          "cache-control": "no-cache",
        },
        timeout: 10000,
      });

      return { success: true, data: response.data };
    } catch (error) {
      const errMsg = error.response?.data || error.message;
      console.error("❌ EasyAccess Get Plans Error:", errMsg);
      return { success: false, error: errMsg };
    }
  },

  /**
   * Make POST request to EasyAccess
   */
  async makePostRequest(endpoint, payload) {
    try {
      const cfg = await getEasyAccessRuntimeConfig();
      const formData = new FormData();
      for (const key in payload) {
        formData.append(key, payload[key]);
      }

      const response = await axios.post(
        `${cfg.baseUrl}/${endpoint}`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            AuthorizationToken: cfg.apiKey,
            "cache-control": "no-cache",
          },
          // timeout: 10000,
        }
      );

      return { success: true, data: response.data };
    } catch (error) {
      console.error(
        "❌ EasyAccess POST Error:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || "EasyAccess POST failed",
      };
    }
  },

  async verifyTVSubscription({ company, iucno }) {
    if (!company || !iucno) {
      return { success: false, error: "Company and IUC number are required" };
    }

    const payload = {
      company,
      iucno,
    };

    return this.makePostRequest("api/verifytv.php", payload);
  },

  /**
   * Subscribe to a TV package
   */
  async payTVSubscription({ company, iucno, packageCode, amount }) {
    const request_id = generateRequestId();

    const payload = {
      company,
      iucno,
      package: packageCode,
      ...(amount && { amount }), // optional max amount
      client_reference: request_id,
    };

    return this.makePostRequest("api/paytv.php", payload);
  },

  /**
   * Verify Electricity Meter Number
   */
  async verifyElectricityMeter({ company, metertype, meterno, amount }) {
    const payload = {
      company,
      metertype,
      meterno,
      amount,
    };
    return this.makePostRequest("api/verifyelectricity.php", payload);
  },

  /**
   * Pay Electricity Bill (Prepaid or Postpaid)
   */
  async payElectricityBill({ company, metertype, meterno, amount }) {
    const request_id = generateRequestId();
    const payload = {
      company,
      metertype,
      meterno,
      amount,
      client_reference: request_id,
    };

    return this.makePostRequest("api/payelectricity.php", payload);
  },

  async purchaseExamPin({ no_of_pins, max_amount_payable, type }) {
    const payload = {
      type,
      no_of_pins,
      // max_amount_payable,
    };
    return this.makePostRequest(`api/${type}_v2.php`, payload);
  },

  /**
   * Purchase Data
   */
  async purchaseData({ phone, network, dataplan }) {
    const request_id = generateRequestId();
    const payload = {
      network,
      mobileno: phone,
      dataplan,
      client_reference: request_id,
      max_amount_payable : 2000,
    };

    return this.makePostRequest("api/data.php", payload);
  },
};

module.exports = EasyAccessService;
