const EasyAccessService = require("../../providers/easyAccess");
const AutopilotService = require("../../providers/autopilot");
const User = require("../../models/userModel");
const bcrypt = require("bcryptjs");
const SubService = require("../../models/subServicesModel");
const Tenant = require("../../models/tenantModel");
const saveTransaction = require("../../utils/functions/saveTransaction");

const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
  enforceTenantRiskControls,
  runInMongoTransaction,
} = require("../../business_logic/billstackLogic");

const NETWORK_MAP = {
  ekoelectric: { easyaccess: "01", autopilot: "1" }, // EKEDC
  ikejaelectric: { easyaccess: "02", autopilot: "2" }, // IKEDC
  portharcourtelectric: { easyaccess: "03", autopilot: "3" }, // PHEDC
  kadunaelectric: { easyaccess: "04", autopilot: "4" }, // KAEDC
  abujaelectric: { easyaccess: "05", autopilot: "5" }, // AEDC
  ibedcelectric: { easyaccess: "06", autopilot: "6" }, // IBEDC
  kanoelectric: { easyaccess: "07", autopilot: "7" }, // KEDC
  joselectric: { easyaccess: "08", autopilot: "8" }, // JEDC
  enuguelectric: { easyaccess: "09", autopilot: "9" }, // EEDC
  beninelectric: { easyaccess: "10", autopilot: "10" }, // BEDC
  abaelectric: { easyaccess: "11", autopilot: "11" }, // ABA
  yolaelectric: { easyaccess: "12", autopilot: "12" }, // YEDC
};

const httpError = (statusCode, message) => {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
};

const toTransactionSummary = (t) => {
  if (!t) return null;
  return {
    _id: t._id,
    service: t.service,
    status: t.status,
    message: t.message,
    amount: t.amount,
    reference_no: t.reference_no,
    provider_reference: t.provider_reference,
    createdAt: t.createdAt,
    company: t.company,
    meter_type: t.meter_type,
    meter_no: t.meter_no,
    token: t.token,
    customer_name: t.customer_name,
    previous_balance: t.previous_balance,
    new_balance: t.new_balance,
  };
};

const verifyMeter = async (req, res) => {
  let { company, metertype, meterno, amount } = req.body;
  console.log(req.body);

  // Validate input early
  if (!company || !metertype || !meterno) {
    return res
      .status(400)
      .json({ error: "company, metertype and meterno are required" });
  }

  try {
    const networkKey = company.trim().toLowerCase().replace(/\s+/g, "");
    const mappedCodes = NETWORK_MAP[networkKey];
    if (!mappedCodes) {
      return res.status(400).json({ error: "Invalid electricity company" });
    }

    const meterTypeCode = metertype.toLowerCase() === "prepaid" ? "01" : "02";

    const result = await EasyAccessService.verifyElectricityMeter({
      company: mappedCodes.easyaccess,
      metertype: meterTypeCode,
      meterno,
      amount,
    });

    if (result.success) {
      return res.status(200).json(result.data);
    }

    return res
      .status(400)
      .json({ error: result.error || "Verification failed" });
  } catch (err) {
    console.error("Error verifying meter:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

const purchaseElectricity = async (req, res) => {
  try {
    const result = await runInMongoTransaction(async (session) => {
      const authUserId = req.user?._id;
      const {
        company,
        type,
        meter_no,
        amount,
        userId: bodyUserId,
        pinCode,
        planId,
        phone,
      } = req.body;

      if (!authUserId) throw httpError(401, "Not authorized");
      if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
        throw httpError(403, "User mismatch");
      }

      if (!company || !type || !meter_no || !amount || !phone) {
        throw httpError(400, "Missing required fields");
      }

      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 50) {
        throw httpError(400, "Invalid amount");
      }

      const userId = authUserId;
      const user = await User.findById(userId).session(session);
      if (!user) throw httpError(404, "User not found");

      let effectiveTenantId = user.tenantId || null;
      let tenantOwnerUserId = null;
      if (effectiveTenantId) {
        const t = await Tenant.findById(effectiveTenantId)
          .select("status ownerUserId")
          .session(session);
        if (!t || t.status !== "active") {
          effectiveTenantId = null;
        } else {
          tenantOwnerUserId = t.ownerUserId || null;
        }
      }

      const { pinRequired } = await enforceTenantRiskControls({
        user,
        amount: parsedAmount,
        service: "electricity",
        session,
      });
      if (pinRequired || user.pinStatus) {
        if (!pinCode || typeof pinCode !== "string") {
          throw httpError(400, "Transaction PIN is required");
        }
        if (!user.pinCode) {
          throw httpError(400, "Set your transaction PIN to continue");
        }
        const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
        if (!isPinValid) {
          throw httpError(401, "Invalid transaction PIN");
        }
      }

      const plan = await SubService.findById(planId).session(session);
      if (!plan) throw httpError(404, "Plan not found or inactive");

      const previousBalance = user?.balance;

      const debitResult = await deductFromVirtualAccount(
        userId,
        parsedAmount,
        session
      );

      const enabledApi = plan.provider;
      const companyKey = company.toLowerCase().replace(/\s+/g, "");
      const mappedCodes = NETWORK_MAP[companyKey];
      if (!mappedCodes) throw httpError(400, `Invalid Disco '${company}'`);

      const providerResult =
        enabledApi === "autopilot"
          ? await AutopilotService.purchaseElectricity({
              disco: mappedCodes.autopilot,
              meterNumber: meter_no,
              meterType: type.toLowerCase() === "prepaid" ? "01" : "02",
              amount: parsedAmount,
            })
          : await EasyAccessService.payElectricityBill({
              company: mappedCodes.easyaccess,
              metertype: type.toLowerCase() === "prepaid" ? "01" : "02",
              meterno: meter_no,
              amount: parsedAmount,
            });

      const isFailure =
        providerResult?.success === false ||
        providerResult?.data?.success === "false" ||
        providerResult?.data?.success === "false_disabled" ||
        providerResult?.status === false;

      const txnExtra = {
        userId,
        tenantId: effectiveTenantId,
        tenantOwnerUserId,
        amount: parsedAmount,
        phone,
        network: company.toLowerCase(),
        meterType: type,
        company,
        provider: enabledApi,
      };

      let finalBalance = debitResult?.new_balance ?? previousBalance;
      if (isFailure) {
        const refundResult = await refundToVirtualAccount(
          userId,
          parsedAmount,
          session
        );
        finalBalance = refundResult?.new_balance ?? previousBalance;
      }

      const transaction = await saveTransaction(
        {
          response: providerResult || {},
          serviceType: "electricity",
          status: isFailure ? "failed" : "success",
          extra: txnExtra,
          previous_balance: previousBalance,
          new_balance: finalBalance,
        },
        { session }
      );

      return isFailure
        ? {
            status: 400,
            body: {
              message: "❌ Electricity purchase failed",
              transactionId: transaction?._id || null,
              transaction: toTransactionSummary(transaction),
              error: providerResult?.error || "Purchase failed from provider",
              success: false,
            },
          }
        : {
            status: 200,
            body: {
              message: "✅ Electricity purchase successful",
              transactionId: transaction?._id || null,
              transaction: toTransactionSummary(transaction),
              data: providerResult.data,
              success: true,
            },
          };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Error purchasing electricity:", err);
    const status = err?.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
    return res.status(status).json({ error: err.message || "Server error" });
  }
};

module.exports = {
  verifyMeter,
  purchaseElectricity,
};
