const AutopilotService = require("../../providers/autopilot");
const saveTransaction = require("../../utils/functions/saveTransaction");
const User = require("../../models/userModel");
const Tenant = require("../../models/tenantModel");
const bcrypt = require("bcryptjs");
const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
  enforceTenantRiskControls,
  chargeMerchantTransactionFee,
  runInMongoTransaction,
} = require("../../business_logic/billstackLogic");
const NETWORK_PREFIXES = require("../../utils/constant/networkPrefix");
const calculateDiscount = require("../../utils/functions/calculateDiscount");

const NETWORK_MAP = {
  mtn: { autopilot: "1" },
  airtel: { autopilot: "2" },
  glo: { autopilot: "3" },
  "9mobile": { autopilot: "4" },
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
    network: t.network,
    mobile_no: t.mobile_no,
    previous_balance: t.previous_balance,
    new_balance: t.new_balance,
  };
};

const purchaseAirtime = async (req, res) => {
  try {
    const result = await runInMongoTransaction(async (session) => {
      const authUserId = req.user?._id;
      const {
        planId,
        phone,
        amount,
        userId: bodyUserId,
        pinCode,
        networkId,
        airtimeType,
      } = req.body;

      if (!authUserId) throw httpError(401, "Not authorized");
      if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
        throw httpError(403, "User mismatch");
      }
      if (!phone || !amount || !networkId) {
        throw httpError(400, "Missing required fields");
      }

      const userId = authUserId;
      const user = await User.findById(userId).session(session);
      if (!user) throw httpError(404, "User not found");

      let effectiveTenantId = user.tenantId || null;
      let tenantOwnerUserId = null;
      let merchantFee = { enabled: false, amount: 0 };
      if (effectiveTenantId) {
        const t = await Tenant.findById(effectiveTenantId)
          .select("status ownerUserId billingSettings")
          .session(session);
        if (!t || t.status !== "active") {
          effectiveTenantId = null;
        } else {
          tenantOwnerUserId = t.ownerUserId || null;
          merchantFee = {
            enabled: t.billingSettings?.merchantFeeEnabled === true,
            amount: Number(t.billingSettings?.merchantFeeAmount || 0),
          };
        }
      }

      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw httpError(400, "Invalid amount");
      }

      const phonePrefix4 = phone.substring(0, 4);
      const phonePrefix5 = phone.substring(0, 5);
      const validPrefixes = NETWORK_PREFIXES[networkId.toLowerCase()];
      if (
        !validPrefixes ||
        (!validPrefixes.includes(phonePrefix4) &&
          !validPrefixes.includes(phonePrefix5))
      ) {
        throw httpError(
          400,
          `❌ Phone number ${phone} does not match ${networkId.toUpperCase()} network.`
        );
      }

      const previousBalance = user.balance;
      const discountedAmount = calculateDiscount(parsedAmount, "percentage", 2);

      const { pinRequired } = await enforceTenantRiskControls({
        user,
        amount: discountedAmount,
        service: "airtime",
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

      const debitResult = await deductFromVirtualAccount(
        userId,
        discountedAmount,
        session
      );

      const networkKey = networkId.toLowerCase();
      const mappedCodes = NETWORK_MAP[networkKey];
      if (!mappedCodes) throw httpError(400, "Invalid network selected");

      const providerResult = await AutopilotService.purchaseAirtime({
        networkId: mappedCodes.autopilot,
        phone,
        amount,
        airtimeType: airtimeType || "VTU",
      });

      const txnExtra = {
        userId,
        tenantId: effectiveTenantId,
        tenantOwnerUserId,
        amount: discountedAmount,
        phone,
        network: networkId,
      };

      const isFailure =
        !providerResult ||
        providerResult.success === false ||
        providerResult.data?.success === "false" ||
        providerResult.status === false;

      let finalBalance = debitResult?.new_balance ?? previousBalance;
      if (isFailure) {
        const refundResult = await refundToVirtualAccount(
          userId,
          discountedAmount,
          session
        );
        finalBalance = refundResult?.new_balance ?? previousBalance;
      }

      let merchantFeeResult = null;
      if (!isFailure && effectiveTenantId && tenantOwnerUserId && merchantFee.enabled && merchantFee.amount > 0) {
        merchantFeeResult = await chargeMerchantTransactionFee({
          merchantUserId: tenantOwnerUserId,
          amount: merchantFee.amount,
          session,
        });
        txnExtra.merchant_fee_amount = merchantFeeResult?.amount ?? merchantFee.amount;
        txnExtra.merchant_fee_charged = merchantFeeResult?.charged === true;
        txnExtra.merchant_fee_deferred = merchantFeeResult?.deferred === true;
      }

      const transaction = await saveTransaction(
        {
          response: providerResult || {},
          serviceType: "airtime",
          status: isFailure ? "failed" : "success",
          extra: txnExtra,
          transaction_type: "debit",
          previous_balance: previousBalance,
          new_balance: finalBalance,
        },
        { session }
      );

      return isFailure
        ? {
            status: 400,
            body: {
              message: "❌ Airtime purchase failed",
              transactionId: transaction?._id,
              transaction: toTransactionSummary(transaction),
              error: providerResult?.error || "Unknown error from provider",
              success: false,
            },
          }
        : {
            status: 200,
            body: {
              message: "✅ Airtime purchased successfully",
              transactionId: transaction?._id,
              transaction: toTransactionSummary(transaction),
              success: true,
            },
          };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("❌ Error purchasing airtime:", error);
    const status = error?.statusCode && Number.isFinite(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({ error: error.message || "An unexpected error occurred" });
  }
};

module.exports = {
  purchaseAirtime,
};
