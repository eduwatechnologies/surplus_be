const axios = require("axios");
require("dotenv").config();
const  generateAutopilotReference  = require("../utils/generateAutopilotRef");
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

async function getAutopilotRuntimeConfig() {
  const p = await loadProvidersConfig();
  const ap = p?.autopilot || {};
  return {
    baseUrl: ap.baseUrl || process.env.AUTOPILOT_BASE_URL,
    apiKey: ap.apiKey || process.env.AUTOPILOT_API_KEY,
  };
}

const AutopilotService = {
  // async makeGetRequest(endpoint, payload) {
  //   try {
  //     console.log(`${AUTOPILOT_BASE_URL}/load/${endpoint}`);
  //     const response = await axios.post(
  //       `${AUTOPILOT_BASE_URL}/load/${endpoint}`,
  //       payload,
  //       {
  //         headers: {
  //           "Content-Type": "application/json",
  //           Accept: "application/json",
  //           Authorization: `Bearer ${AUTOPILOT_API_KEY}`,
  //         },
  //       }
  //     );
  //     return {
  //       success: response.data.status,
  //       data: response.data.data.product,
  //     };
  //   } catch (err) {
  //     console.error(
  //       "Error fetching data types:",
  //       err.response?.data || err.message
  //     );
  //     return [];
  //   }
  // },

  async makeGetRequest(endpoint, params = {}) {
    const cfg = await getAutopilotRuntimeConfig();
    try {
      const response = await axios.get(`${cfg.baseUrl}/${endpoint}`, {
        params,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
      });
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      const errData = error.response?.data || error.message;
      console.error(`❌ Autopilot GET Error on [${endpoint}]:`, errData);
      return {
        success: false,
        error: errData,
      };
    }
  },

  async makePostRequest(endpoint, payload) {
    try {
      const cfg = await getAutopilotRuntimeConfig();
      const response = await axios.post(
        `${cfg.baseUrl}/${endpoint}`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          // timeout: 10000,
        }
      );

      return {
        success: response.data.status,
        data: response.data,
      };
    } catch (error) {
      const errData = error.response?.data || error.message;
      console.error(`❌ Autopilot POST Error on [${endpoint}]:`, errData);
      return {
        success: false,
        error: errData,
      };
    }
  },

  // ✅ DATA
  async getDataType(networkId) {
    return this.makeGetRequest("data-types", { networkId });
  },

  // ✅ Data Plans
  async getData(networkId, dataType) {
    return this.makeGetRequest("data", { networkId, dataType });
  },

  // ✅ AIRTIME
  async getNetworks(networks) {
    return this.makeGetRequest("networks", { networks });
  },

  // ✅ DATA
  async purchaseData({ phone, networkId, planId, dataType }) {
    const reference = generateAutopilotReference();
    const payload = { networkId, dataType, planId, phone, reference };
    return this.makePostRequest("data", payload);
  },

  async purchaseAirtime({
    networkId,
    airtimeType,
    amount,
    phone,
    quantity = 1,
  }) {
    const reference = generateAutopilotReference();
    const payload = { networkId, airtimeType, amount, phone, reference };
    if (airtimeType === "SNS") payload.quantity = quantity;
    return this.makePostRequest("airtime", payload);
  },

  // ✅ CABLE TV
  // async getCableTypes() {
  //   return this.makePostRequest("load/cable-types", { cables: "all" });
  // },

  // async getCablePackages(cableType) {
  //   return this.makePostRequest("load/cable-packages", { cableType });
  // },

  async validateSmartcard(cableType, smartCardNo) {
    return this.makePostRequest("validate/smartcard-no", {
      cableType,
      smartCardNo,
    });
  },

  async payTVSubscription({
    cableType,
    planId,
    customerName,
    smartCardNo,
    phoneNo, // only used for SHOWMAX
    amount, // only used for TOP_UP
    paymentTypes = "FULL_PAYMENT",
  }) {
    const reference = generateAutopilotReference();
    let payload = {
      cableType,
      planId,
      paymentTypes,
      reference,
    };

    if (cableType === "SHOWMAX") {
      payload.phoneNo = phoneNo;
    } else {
      payload.customerName = customerName;
      payload.smartCardNo = smartCardNo;
      if (paymentTypes === "TOP_UP") {
        payload.amount = amount;
      }
    }

    return this.makePostRequest("cable", payload);
  },
};

module.exports = AutopilotService;
