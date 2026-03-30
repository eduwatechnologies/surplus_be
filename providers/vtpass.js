const axios = require("axios");
require("dotenv").config();
const { generateRequestId } = require("../utils/generateRequestId");
const Transaction = require("../models/transactionModel");
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

async function getVtpassRuntimeConfig() {
  const p = await loadProvidersConfig();
  const vt = p?.vtpass || {};
  return {
    baseUrl: vt.baseUrl || process.env.VTPASS_BASE_URL,
    apiKey: vt.apiKey || process.env.VTPASS_API_KEY,
    publicKey: vt.publicKey || process.env.VTPASS_PUBLIC_KEY,
    secretKey: vt.secretKey || process.env.VTPASS_SECRET_KEY,
  };
}

function buildHeaders(cfg) {
  return {
    "api-key": cfg.apiKey,
    "public-key": cfg.publicKey,
    "secret-key": cfg.secretKey,
    "Content-Type": "application/json",
  };
}

const VTpassService = {
  /**
   * Generic GET request handler
   */
  async makeGetRequest(endpoint, params = {}) {
    try {
      const cfg = await getVtpassRuntimeConfig();
      const response = await axios.get(`${cfg.baseUrl}/${endpoint}`, {
        headers: buildHeaders(cfg),
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(
        "VTpass GET Request Error:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || "GET request failed",
      };
    }
  },

  /**
   * Generic POST request handler
   */

  async makePostRequest(endpoint, payload) {
    try {
      const cfg = await getVtpassRuntimeConfig();
      const response = await axios.post(
        `${cfg.baseUrl}/${endpoint}`,
        payload,
        { headers: buildHeaders(cfg) } // 10s timeout
      );

      // console.log("✅ VTpass Response:", response.data);

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      const errorMsg = error.response?.data || error.message;
      console.error("❌ VTpass POST Request Error:", errorMsg);

      return {
        success: false,
        error: errorMsg,
      };
    }
  },

  /**
   * Save transaction to database
   */
  async saveTransaction({ userId, response_data, transaction_type, dataName }) {
    try {
      // Normalize transaction data
      let transactionData = {
        userId,
        response_data, // Store the full response
        transaction_type,
        dataName,
        request_id: null,
        reference: null,
        accountNumber: null,
        amount: null,
        status: null,
        product_name: null,
        transaction_date: null,
        token: null,
        phone: null,
      };

      if (transaction_type === "VTpass") {
        transactionData.request_id = response_data.requestId;
        transactionData.reference = response_data.transactionId;
        transactionData.amount = response_data.amount;
        transactionData.status = response_data.content?.transactions?.status;
        transactionData.phone =
          response_data.content?.transactions?.unique_element;
        transactionData.product_name =
          response_data.content?.transactions?.product_name;
        transactionData.transaction_date = response_data.transaction_date;

        // Extract token correctly
        const tokenValue =
          response_data.token || response_data.purchased_code || null;
        transactionData.token =
          typeof tokenValue === "string"
            ? tokenValue.replace(/\D/g, "")
            : tokenValue;

        transactionData.accountNumber =
          response_data.transactions?.unique_element || null;
      } else if (transaction_type === "Billstack") {
        const data = response_data.data;
        transactionData.request_id = data.merchant_reference;
        transactionData.reference = data.reference;
        transactionData.amount = data.amount;
        transactionData.status = "SUCCESS"; // Assuming all received payments are successful
        transactionData.product_name = "Reserved Account Transaction";
        transactionData.transaction_date = data.created_at;
        transactionData.accountNumber = data.account?.account_number;
      }

      // Check if transaction already exists
      if (transactionData.reference) {
        const existingTransaction = await Transaction.findOne({
          reference: transactionData.reference,
        });
        if (existingTransaction) {
          console.log(
            "⚠ Transaction already exists:",
            transactionData.reference
          );
          return;
        }
      }

      // Save new transaction
      const transaction = new Transaction(transactionData);
      await transaction.save();
      console.log("✅ Transaction saved:", transactionData.reference);
    } catch (error) {
      console.error("❌ Error saving transaction:", error.message);
    }
  },

  /* Save transaction to database*/
  async updateTransaction(query, updateData) {
    try {
      const transaction = await Transaction.findOneAndUpdate(
        query,
        updateData,
        {
          new: true, // Return the updated document
        }
      );

      if (!transaction) {
        console.log("⚠ Transaction not found:", query);
        return { success: false, message: "Transaction not found" };
      }

      console.log("✅ Transaction updated:", transaction);
      return { success: true, transaction };
    } catch (error) {
      console.error("❌ Error updating transaction:", error.message);
      return { success: false, message: "Transaction update failed" };
    }
  },

  /**
   * Purchase Airtime
   */
  async purchaseAirtime(phone, amount, network) {
    const request_id = generateRequestId();
    const payload = { request_id, serviceID: network, phone, amount };
    return this.makePostRequest("pay", payload);
  },

  /**
   * Purchase Data
   */
  async purchaseData(phone, network, variation_code, amount) {
    const payload = {
      request_id: generateRequestId(),
      serviceID: network,
      billersCode: phone,
      phone,
      variation_code,
      amount,
    };
    return this.makePostRequest("pay", payload);
  },

  /**
   * Pay Electricity Bills
   */
  async payElectricity(meter_number, disco, amount, phone, type = "prepaid") {
    const payload = {
      request_id: generateRequestId(),
      serviceID: disco,
      billersCode: meter_number,
      variation_code: type,
      amount,
      phone,
    };
    return this.makePostRequest("pay", payload);
  },

  /**
   * Verify Electricity Meter Number
   */
  async verifyMeter(meter_number, provider, type) {
    const payload = { billersCode: meter_number, serviceID: provider, type };
    return this.makePostRequest("merchant-verify", payload);
  },

  /**
   * Subscribe to Cable TV
   */
  async subscribeCable(
    smartcard_number,
    provider,
    variation_code,
    phone,
    amount,
    subscription_type,
    quantity
  ) {
    const payload = {
      request_id: generateRequestId(),
      serviceID: provider,
      billersCode: smartcard_number,
      variation_code,
      phone,
      amount,
      subscription_type,
      quantity,
    };
    return this.makePostRequest("pay", payload);
  },

  /**
   * Verify Cable TV Smartcard Number
   */
  async verifySmartcard(smartcard_number, provider) {
    const payload = {
      billersCode: smartcard_number,
      serviceID: provider,
    };
    return this.makePostRequest("merchant-verify", payload);
  },

  /**
   * Purchase Exam PINs (WAEC, JAMB, NECO)
   */
  async payExam(pin_type, quantity, variation_code, amount, phone) {
    const payload = {
      request_id: generateRequestId(),
      serviceID: pin_type,
      quantity,
      variation_code,
      amount,
      phone,
    };
    return this.makePostRequest("pay", payload);
  },

  /**
   * Verify Transaction
   */
  async verifyTransaction(request_id) {
    return this.makeGetRequest("requery", { request_id });
  },

  /**
   * Get Service Variations (e.g., data bundle prices)
   */
  async getServiceVariations(serviceID) {
    return this.makeGetRequest("service-variations", { serviceID });
  },

  /**
   * Handle Variation Updates (Webhook processing)
   */
  async processVariationUpdate(data) {
    try {
      const { type, serviceID, summary, actionRequired, datetime } = data;
      if (type !== "variations-update") {
        console.error("❌ Invalid webhook type:", type);
        return { success: false, message: "Invalid webhook type" };
      }
      console.log(`🔔 VTpass Variation Update for Service: ${serviceID}`);
      console.log(`📅 DateTime: ${datetime}`);
      console.log(`📊 Summary:`, summary);
      console.log(
        `✅ Updated Variations:`,
        actionRequired.updated.variation_codes
      );
      console.log(
        `❌ Removed Variations:`,
        actionRequired.removed.variation_codes
      );
      console.log(`➕ Added Variations:`, actionRequired.added.variation_codes);
      return { success: true, message: "Webhook processed successfully" };
    } catch (error) {
      console.error("❌ Error processing variation update:", error);
      return { success: false, message: "Error processing webhook" };
    }
  },

  async processWebhook(data) {
    try {
      const { type, data: webhookData } = data;

      if (
        type !== "transaction-update" ||
        !webhookData?.content?.transactions
      ) {
        console.warn("⚠ Invalid webhook payload.");
        return { success: false, error: "Invalid webhook payload" };
      }

      const transaction = webhookData.content.transactions;
      const { status, transactionId, requestId, amount } = transaction;

      console.log(
        `🔄 Updating transaction ${transactionId}: Status - ${status}`
      );

      let updateData = { status };

      if (status === "delivered") {
        updateData.status = "success";
      } else if (status === "reversed") {
        updateData.status = "reversed";
      }

      const updateResult = await this.updateTransaction(
        { requestId },
        updateData
      );

      if (!updateResult.success) {
        return { success: false, message: "Transaction update failed" };
      }

      if (status === "reversed") {
        await this.refundToVirtualAccount(requestId, amount);
        return {
          success: true,
          message: "Transaction reversed & user refunded",
        };
      }

      return { success: true, message: "Transaction status updated" };
    } catch (error) {
      console.error("❌ Webhook Handling Error:", error.message);
      return { success: false, error: "Server error" };
    }
  },
};

module.exports = VTpassService;
