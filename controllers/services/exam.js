const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../../models/userModel");
const Tenant = require("../../models/tenantModel");
const TenantPlanPrice = require("../../models/tenantPlanPriceModel");
const servicePlanModel = require("../../models/servicePlanModel");
const saveTransaction = require("../../utils/functions/saveTransaction");
const EasyAccessService = require("../../providers/easyAccess");

const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
  enforceTenantRiskControls,
} = require("../../business_logic/billstackLogic");

const ALLOWED_PIN_COUNTS = [1, 2, 3, 4, 5, 10];

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

const purchaseExamPin = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const authUserId = req.user?._id;
    const { noOfPin, userId: bodyUserId, pinCode, planId } = req.body;

    if (!authUserId) {
      await session.abortTransaction();
      return res.status(401).json({ success: false, message: "Not authorized" });
    }
    if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: "User mismatch" });
    }

    // 1️⃣ Validate required fields
    if (!noOfPin || !planId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Missing required fields: 'noOfPin', 'planId'",
      });
    }

    // 2️⃣ Validate allowed pin count
    if (!ALLOWED_PIN_COUNTS.includes(Number(noOfPin))) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid number of pins. Allowed values: 1, 2, 3, 4, 5, 10",
      });
    }

    // 3️⃣ Validate user
    const userId = authUserId;
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 5️⃣ Fetch plan from DB (with populated subService)
    const plan = await servicePlanModel
      .findById(planId)
      .populate("subServiceId")
      .session(session);

    if (!plan || !plan.active) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Selected plan not found or inactive",
      });
    }

    const baseUnitPrice = Number(plan.ourPrice);
    if (!Number.isFinite(baseUnitPrice) || baseUnitPrice <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Invalid plan pricing" });
    }

    let effectiveTenantId = user.tenantId || null;
    let tenantOwnerUserId = null;
    if (effectiveTenantId) {
      const tenant = await Tenant.findById(effectiveTenantId)
        .select("status ownerUserId")
        .session(session);
      if (!tenant || tenant.status !== "active") {
        effectiveTenantId = null;
      } else {
        tenantOwnerUserId = tenant.ownerUserId || null;
      }
    }

    let override = null;
    if (effectiveTenantId) {
      override =
        (await TenantPlanPrice.findOne({
          tenantId: effectiveTenantId,
          userId: user._id,
          planId: plan._id,
          active: true,
        })
          .select("pricingType value active")
          .session(session)) ||
        (await TenantPlanPrice.findOne({
          tenantId: effectiveTenantId,
          userId: null,
          planId: plan._id,
          active: true,
        })
          .select("pricingType value active")
          .session(session));
    }

    const rawSellingUnit = computeSellingPrice(baseUnitPrice, override);
    const sellingUnitPrice = rawSellingUnit === null ? null : Math.round(rawSellingUnit);
    if (!Number.isFinite(sellingUnitPrice) || sellingUnitPrice <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Unable to compute selling price" });
    }

    const baseTotalCost = baseUnitPrice * Number(noOfPin);
    const totalCost = sellingUnitPrice * Number(noOfPin);
    const previousBalance = user.balance;

    const { pinRequired } = await enforceTenantRiskControls({ user, amount: totalCost, service: "exam_pin", session });
    if (pinRequired || user.pinStatus) {
      if (!pinCode || typeof pinCode !== "string") {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: "Transaction PIN is required" });
      }
      if (!user.pinCode) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: "Set your transaction PIN to continue" });
      }
      const isPinValid = await bcrypt.compare(pinCode, user.pinCode);
      if (!isPinValid) {
        await session.abortTransaction();
        return res.status(401).json({ success: false, message: "Invalid transaction PIN" });
      }
    }

    // 6️⃣ Check wallet balance
    if (user.balance < totalCost) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. You need at least ₦${totalCost}`,
      });
    }

    // 7️⃣ Deduct from wallet
    await deductFromVirtualAccount(userId, totalCost, session);

    const enabledApi = plan.provider; // e.g. "easyaccess"
    let result;

    // 8️⃣ Call API provider
    if (enabledApi === "easyaccess") {
      result = await EasyAccessService.purchaseExamPin({
        no_of_pins: noOfPin,
        type: plan.category, // WAEC, NECO etc.
        // exam_id: plan.easyaccessId, // provider’s internal id
      });
    } else {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid provider configured for this plan",
      });
    }

    // 9️⃣ Handle failed provider response
    const isSuccess =
      result?.success === true ||
      result?.status === true ||
      result?.data?.success === true;

    if (!isSuccess) {
      // refund user immediately
      await refundToVirtualAccount(userId, totalCost, session);

      const failedTx = await saveTransaction({
        response: result || {},
        serviceType: "exam_pin",
        status: "failed",
        extra: {
          userId,
          tenantId: effectiveTenantId,
          tenantOwnerUserId,
          platform_price: baseTotalCost,
          selling_price: totalCost,
          merchant_profit: totalCost - baseTotalCost,
          planId,
          noOfPin,
          amount: totalCost,
          provider: enabledApi,
        },
        previous_balance: previousBalance,
        new_balance: previousBalance,
      });

      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message:
          result?.data?.message || result?.error || "Exam pin purchase failed",
        transactionId: failedTx._id,
      });
    }

    // 🔟 If successful, finalize and log transaction
    const updatedUser = await User.findById(userId).session(session);

    const successTx = await saveTransaction({
      response: result || {},
      serviceType: "exam_pin",
      status: "success",
      extra: {
        userId,
        tenantId: effectiveTenantId,
        tenantOwnerUserId,
        platform_price: baseTotalCost,
        selling_price: totalCost,
        merchant_profit: totalCost - baseTotalCost,
        planId,
        noOfPin,
        amount: totalCost,
        provider: enabledApi,
      },
      previous_balance: previousBalance,
      new_balance: updatedUser.balance,
    });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "✅ Exam pin purchase successful",
      data: result.data,
      transactionId: successTx._id,
    });
  } catch (error) {
    console.error("Error purchasing exam pin:", error);
    await session.abortTransaction();
    const status = error?.statusCode && Number.isFinite(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({ success: false, message: error.message || "Internal Server Error" });
  } finally {
    session.endSession();
  }
};

module.exports = { purchaseExamPin };
