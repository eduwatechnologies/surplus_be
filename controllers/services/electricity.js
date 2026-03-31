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
    const authUserId = req.user?._id;
    const { company, type, meter_no, amount, userId: bodyUserId, pinCode, planId, phone } =
      req.body;

    if (!authUserId) return res.status(401).json({ error: "Not authorized" });
    if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
      return res.status(403).json({ error: "User mismatch" });
    }

    if (!company || !type || !meter_no || !amount || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 50) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const userId = authUserId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let effectiveTenantId = user.tenantId || null;
    let tenantOwnerUserId = null;
    if (effectiveTenantId) {
      const t = await Tenant.findById(effectiveTenantId).select("status ownerUserId").lean();
      if (!t || t.status !== "active") {
        effectiveTenantId = null;
      } else {
        tenantOwnerUserId = t.ownerUserId || null;
      }
    }

    const { pinRequired } = await enforceTenantRiskControls({ user, amount: parsedAmount, service: "electricity" });
    if (pinRequired || user.pinStatus) {
      if (!pinCode || typeof pinCode !== "string") {
        return res.status(400).json({ error: "Transaction PIN is required" });
      }
      if (!user.pinCode) {
        return res.status(400).json({ error: "Set your transaction PIN to continue" });
      }
      const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
      if (!isPinValid) {
        return res.status(401).json({ error: "Invalid transaction PIN" });
      }
    }

    const plan = await SubService.findById(planId);
    if (!plan) {
      return res.status(404).json({ error: "Plan not found or inactive" });
    }

    const previousBalance = user?.balance;

    await deductFromVirtualAccount(userId, parsedAmount);

    const enabledApi = plan.provider;
    const companyKey = company.toLowerCase().replace(/\s+/g, "");
    const mappedCodes = NETWORK_MAP[companyKey];
    if (!mappedCodes) {
      return res.status(400).json({ error: `Invalid Disco '${company}'` });
    }

    const result =
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

    let transaction;

    if (
      result.success === false ||
      result.data?.success === "false" ||
      result.data?.success === "false_disabled" ||
      result.status === false
    ) {
      transaction = await saveTransaction({
        response: result || {},
        serviceType: "electricity",
        status: "failed",
        extra: {
          userId,
          tenantId: effectiveTenantId,
          tenantOwnerUserId,
          amount: parsedAmount,
          phone,
          network: company.toLowerCase(),
          meterType: type,
          company,
          provider: enabledApi,
        },
        previous_balance: previousBalance,
        new_balance: previousBalance,
      });

      await refundToVirtualAccount(userId, parsedAmount);

      return res.status(400).json({
        message: "❌ Electricity purchase failed",
        transactionId: transaction?._id || null,
        error: result?.error || "Purchase failed from provider",
      });
    }

    const refundedUser = await User.findById(userId);

    transaction = await saveTransaction({
      response: result,
      serviceType: "electricity",
      status: "success",
      extra: {
        userId,
        tenantId: effectiveTenantId,
        tenantOwnerUserId,
        amount: parsedAmount,
        phone,
        network: company.toLowerCase(),
        meterType: type,
        company,
        provider: enabledApi,
      },
      previous_balance: previousBalance,
      new_balance: refundedUser.balance,
    });

    return res.status(200).json({
      message: "✅ Electricity purchase successful",
      transactionId: transaction?._id || null,
      data: result.data,
    });
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
