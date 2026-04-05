const Transaction = require("../../models/transactionModel");
const generateRefNo = require("../../utils/functions/refNoGenerator");

const saveTransaction = async (
  { response, serviceType, status, previous_balance, new_balance, extra = {} },
  options = {}
) => {
  try {
    const data = response?.data || {};
    const refNo = generateRefNo();
    const session = options?.session || null;

    // ✅ Ensure provider_reference is always unique
    const providerReference =
      data.transaction_ref ||
      response?.transaction_ref ||
      extra.provider_reference || // ✅ Use this instead of transaction_ref for webhook
      extra.transaction_ref ||
      `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // ✅ Check if this provider_reference already exists
    let existingQuery = Transaction.findOne({
      provider_reference: providerReference,
    });
    if (session) existingQuery = existingQuery.session(session);
    const existing = await existingQuery;

    if (existing) {
      console.warn(
        `⚠️ Transaction with provider_reference ${providerReference} already exists.`
      );
      return existing; // Don't try to insert again
    }

    const baseTransaction = {
      service: serviceType,
      message:
        typeof data.message === "string"
          ? data.message
          : typeof response?.message === "string"
          ? response.message
          : response?.response_description || "No message",
      amount: extra.amount || Number(data.amount) || 0,
      tenantId: extra.tenantId || null,
      tenantOwnerUserId: extra.tenantOwnerUserId || null,
      platform_price:
        typeof extra.platform_price === "number" ? extra.platform_price : null,
      selling_price:
        typeof extra.selling_price === "number" ? extra.selling_price : null,
      merchant_profit:
        typeof extra.merchant_profit === "number" ? extra.merchant_profit : null,
      reference_no: refNo || null,
      provider_reference: providerReference || null,
      status: status || "failed",
      transaction_date: new Date(),
      raw_response: JSON.stringify(response || {}),
      userId: extra.userId,
      previous_balance: previous_balance || 0,
      new_balance: new_balance || 0,
    };

    let details = {};

    switch (serviceType) {
      case "airtime":
        details = {
          network: extra.network || data.networkDiscovered || null,
          mobile_no: extra.phone || data.phone || null,
        };
        break;

      case "data":
        details = {
          network: data.network || extra.network,
          mobile_no: data.mobileno || extra.phone,
          data_type: data.dataplan || extra.dataplan,
          client_reference: data.client_reference,
        };
        break;

      case "data_card":
        details = {
          network: data.network,
          data_type: data.data_type,
          pin: data.pin,
        };
        break;

      case "cable_tv":
        details = {
          company: data.company,
          package: data.package,
          iucno: data.iucno,
        };
        break;

      case "electricity":
        details = {
          company: data.company || extra.company,
          meter_type: data.metertype || extra.meterType,
          meter_no: data.meterno || extra.meter_no,
          token: data.token || data.Token || null,
          customer_name: data.customer_name || data.CustomerName || null,
          customer_address:
            data.customer_address || data.CustomerAddress || null,
        };
        break;

      case "exam_pin":
        details = {
          waec_pin: data.waec_pin || data.pin || null,
        };
        break;

      case "wallet":
        details = {
          transaction_type:
            extra.transaction_type || data.transaction_type || null,
          note: extra.note || data.note || null,
        };
        break;

      case "refund":
        details = {
          transaction_type: "refund",
          note: extra.note || "Refund for failed transaction",
        };
        break;

      default:
        console.warn("Unknown service type:", serviceType);
        return;
    }

    const finalTransaction = { ...baseTransaction, ...details };

    if (session) {
      const saved = await Transaction.create([finalTransaction], { session });
      const doc = Array.isArray(saved) ? saved[0] : saved;
      console.log(`[${serviceType}] Transaction ${status} saved:`, doc?._id);
      return doc;
    }

    const saved = await Transaction.create(finalTransaction);
    console.log(`[${serviceType}] Transaction ${status} saved:`, saved?._id);
    return saved;
  } catch (error) {
    if (error.code === 11000) {
      console.warn(
        `⚠️ Duplicate transaction detected for provider_reference: ${error.keyValue?.provider_reference}`
      );
      return null;
    }

    console.error("❌ Error saving transaction:", error);
    return null;
  }
};

module.exports = saveTransaction;
