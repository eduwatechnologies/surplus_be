const VTpassService = require("../providers/vtpass");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const {
  deductFromVirtualAccount,
  refundToVirtualAccount,
} = require("../business_logic/billstackLogic");
const mongoose = require("mongoose");

const handleVTpassTransaction = async ({
  userId,
  amount,
  vtpassCall,
  saveOptions,
  res,
  successMessage,
}) => {
  try {
    // 🔹 Deduct first
    await deductFromVirtualAccount(userId, amount);

    // 🔹 Call VTpass
    const response = await vtpassCall();

    const responseCode = response?.data?.code;
    const responseDescription = response?.data?.response_description;
    const status = response?.data?.content?.transactions?.status;

    // 🔹 Handle specific response codes
    switch (responseCode) {
      case "000":
        // Transaction is processed, check status
        if (status === "delivered") {
          // 🔹 Save transaction if status is delivered
          await VTpassService.saveTransaction({
            userId,
            response_data: response.data,
            transaction_type: "VTpass",
            status: "delivered",
            ...saveOptions,
          });
          return res.json({
            msg: successMessage,
            request_id: response.data.requestId,
          });
        } else if (status === "pending") {
          return res.status(202).json({
            msg: "Transaction is pending, please check back later",
            request_id: response.data.requestId,
          });
        } else {
          return res.status(500).json({
            error: "Transaction failed or was not processed correctly",
            details: response.data,
          });
        }

      case "016":
        // Transaction failed
        // Save the failed transaction with status "failed"
        await VTpassService.saveTransaction({
          userId,
          response_data: response.data,
          transaction_type: "VTpass",
          status: "failed", // You can include a status to indicate failure
          ...saveOptions,
        });

        // Refund to virtual account as usual
        await refundToVirtualAccount(userId, amount);
        return res.status(500).json({
          error: "Transaction Failed",
          details: response.data,
        });

      case "030":
        // Billers not reachable at this point
        await refundToVirtualAccount(userId, amount);
        return res.status(500).json({
          error: "Biller not reachable",
          details: response.data,
        });

      case "011":
        // Invalid Arguments
        await refundToVirtualAccount(userId, amount);
        return res.status(400).json({
          error: "Invalid arguments passed to the request",
          details: response.data,
        });

      case "012":
        // Product does not exist
        await refundToVirtualAccount(userId, amount);
        return res.status(404).json({
          error: "Product does not exist",
          details: response.data,
        });

      case "099":
        // Transaction is processing, need requery
        return res.status(202).json({
          msg: "Transaction is processing, please requery later",
          request_id: response.data.requestId,
        });

      default:
        // Handle any unexpected response code
        await refundToVirtualAccount(userId, amount);
        return res.status(500).json({
          error: "Unknown response code",
          details: response.data,
        });
    }
  } catch (error) {
    console.error("❌ Error in handleVTpassTransaction:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

const handlePin = async (pinCode, user, res) => {
  // 🔐 Verify the PIN only if pinStatus is true
  if (user.pinStatus) {
    const isPinValid = await bcrypt.compare(pinCode, user.pinCode); // Make sure field names match
    if (!isPinValid) {
      return res.status(401).json({ error: "Invalid transaction PIN" });
    }
  }
};

const purchaseAirtime = async (req, res) => {
  const { phone, amount, network, pinCode } = req.body;
  const userId = req.user?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }

  const user = await User.findById(userId);

  // 🔐 Verify the PIN only if pinStatus is true
  await handlePin(pinCode, user, res);
  
  return handleVTpassTransaction({
    userId,
    amount,
    vtpassCall: () => VTpassService.purchaseAirtime(phone, amount, network),
    saveOptions: { request_id: phone }, // you can adjust what to save
    res,
    successMessage: "Airtime purchase successful",
  });
};

const purchaseData = async (req, res) => {
  const { phone, network, variation_code, amount, dataName, pinCode } =
    req.body;
  const userId = req.user?.id;

  if (!phone || !network || !variation_code || !amount) {
    return res.status(400).json({ error: "All fields are required!" });
  }
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }
  const user = await User.findById(userId);

  await handlePin(pinCode, user, res);

  return handleVTpassTransaction({
    userId,
    amount,
    vtpassCall: () =>
      VTpassService.purchaseData(phone, network, variation_code, amount),
    saveOptions: { dataName },
    res,
    successMessage: "Data purchase successful",
  });
};

const payElectricity = async (req, res) => {
  const { meter_number, provider, amount, phone, type, pinCode } = req.body;
  const userId = req.user?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }
  const user = await User.findById(userId);

  await handlePin(pinCode, user, res);

  return handleVTpassTransaction({
    userId,
    amount,
    vtpassCall: () =>
      VTpassService.payElectricity(meter_number, provider, amount, phone, type),
    saveOptions: {},
    res,
    successMessage: "Electricity bill payment successful",
  });
};

const subscribeCable = async (req, res) => {
  const {
    smartcard_number,
    provider,
    variation_code,
    phone,
    amount,
    subscription_type,
    quantity,
    pinCode,
  } = req.body;
  const userId = req.user?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }
  const user = await User.findById(userId);
  await handlePin(pinCode, user, res);

  return handleVTpassTransaction({
    userId,
    amount,
    vtpassCall: () =>
      VTpassService.subscribeCable(
        smartcard_number,
        provider,
        variation_code,
        phone,
        amount,
        subscription_type,
        quantity
      ),
    saveOptions: {},
    res,
    successMessage: "Cable subscription successful",
  });
};

const payExam = async (req, res) => {
  const { pin_type, quantity, variation_code, amount, phone } = req.body;
  const userId = req.user?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }

  return handleVTpassTransaction({
    userId,
    amount,
    vtpassCall: () =>
      VTpassService.payExam(pin_type, quantity, variation_code, amount, phone),
    saveOptions: {},
    res,
    successMessage: "Exam payment successful",
  });
};

const getServiceVariations = async (req, res) => {
  const { serviceID } = req.params;
  try {
    const response = await VTpassService.getServiceVariations(serviceID);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const handleVariationWebhook = async (req, res) => {
  try {
    const response = await VTpassService.processVariationUpdate(req.body);

    if (!response.success) {
      return res.status(400).json({ message: response.message });
    }

    return res.status(200).json({ message: response.message });
  } catch (error) {
    console.error("❌ Error handling webhook:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const handleVTpassWebhook = async (req, res) => {
  try {
    const response = await VTpassService.processWebhook(req.body);

    if (!response.success) {
      return res.json({ message: response.message });
    } else {
      return res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error("❌ Error handling webhook:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const handleVerifymeter = async (req, res) => {
  try {
    const { meter_number, provider, type } = req.body;

    console.log(req.body); // ✅ Fixed Logging

    // Ensure required fields are provided
    if (!meter_number || !provider || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const response = await VTpassService.verifyMeter(
      meter_number,
      provider,
      type
    );

    if (!response || !response.data || !response.data.content) {
      return res.status(500).json({ error: "Unexpected response from VTpass" });
    }

    if (response.data.content?.error) {
      return res.status(400).json({ error: response.data.content.error });
    }

    // Return success response
    res.json({
      msg: "Meter verification successful",
      data: response.data.content,
    });
  } catch (error) {
    console.error("Verification error:", error); // Log full error for debugging
    res.status(500).json({ error: "Internal Server Error!!!" });
  }
};

const handleVerifysmartcard = async (req, res) => {
  try {
    const { smartcard_number, provider, type } = req.body;
    // Ensure required fields are provided
    if (!smartcard_number || !provider) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const response = await VTpassService.verifySmartcard(
      smartcard_number,
      provider
    );

    if (response.data.content.error) {
      return res.status(400).json({ error: response.data.content.error });
    }

    res.json({ msg: "Smartcard verification successful", data: response });
  } catch (error) {
    console.error("❌ Error in handleVerifysmartcard:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  purchaseAirtime,
  purchaseData,
  payElectricity,
  subscribeCable,
  payExam,
  getServiceVariations,
  handleVTpassWebhook,
  handleVariationWebhook,
  handleVerifymeter,
  handleVerifysmartcard,
  handlePin,
};
