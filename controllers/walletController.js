const BillstackService = require("../services/payments/billstackService");
const User = require("../models/userModel");
const Wallet = require("../models/walletModel");

const staffLikeRoles = ["superadmin", "admin", "manager", "support"];

/**
 * Create Virtual Account
 */
const createVirtualAccount = async (req, res) => {
  const { email, reference, firstName, lastName, phone, bank, userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "User not Found" });
  }

  const requesterId = req.user?._id;
  const requesterRole = req.user?.role;
  const canManageAny = requesterRole && staffLikeRoles.includes(String(requesterRole));
  if (!canManageAny && (!requesterId || String(requesterId) !== String(userId))) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const response = await BillstackService.createVirtualAccount({
      user: userId,
      email,
      reference,
      firstName,
      lastName,
      phone,
      bank,
    });

    // Check if the request to Billstack was successful
    if (response.success && response.data?.data?.account?.length) {
      const accountData = response.data.data.account[0];

      // Create new account entry in MongoDB
      const newAccount = new Wallet({
        user: userId,
        bankName: accountData.bank_name,
        accountName: accountData.account_name,
        accountNumber: accountData.account_number,
        bankCode: accountData.bank_code,
        reference: response.data.data.reference,
        meta: response.data.data.meta,
        providerCreatedAt: accountData.created_at ? new Date(accountData.created_at) : null,
      });

      await newAccount.save();

      return res.status(200).json({ success: true, message: "Account created and saved", account: newAccount });
    }

    return res.status(400).json({ success: false, message: "Account not created", data: response });
  } catch (error) {
    console.error("Error creating virtual account:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};



const getVirtualAccount = async (req, res) => {
  try {
    const { userId } = req.params;

    const requesterId = req.user?._id;
    const requesterRole = req.user?.role;
    const canViewAny = requesterRole && staffLikeRoles.includes(String(requesterRole));
    if (!canViewAny && (!requesterId || String(requesterId) !== String(userId))) {
      return res.status(403).json({ message: "Access denied" });
    }

    const user = await User.findById(userId).select("_id").lean();
    if (!user) {
      return res.status(404).json({ message: "User not Found." });
    }

    const accounts = await Wallet.find({ user: userId }).sort({ createdAt: -1 }).lean();

    if (!accounts || accounts.length === 0) {
      return res.status(404).json({ message: "No virtual account found for this user." });
    }

    return res.status(200).json({ accounts });
  } catch (error) {
    console.error("Error fetching virtual account:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};


const verifyPayment = async (req, res) => {
  const { reference } = req.params;
  const response = await BillstackService.verifyPayment(reference);

  return res.status(response.success ? 200 : 400).json(response);
};

const handleWebhook = async (req, res) => {
  const signature = req.headers["x-wiaxy-signature"]; // lowercase
  const response = await BillstackService.processWebhook(req.body, signature);
  return res.status(response.success ? 200 : 403).json(response);
};

const handleRefundUser = async (req, res) => {
  const response = await BillstackService.RefundUser(req.body);
  return res.status(response.success ? 200 : 403).json(response);
};

const handleDefundUser = async (req, res) => {
  const response = await BillstackService.DefundUser(req.body);
  return res.status(response.success ? 200 : 403).json(response);
};

module.exports = {
  handleWebhook,
  verifyPayment,
  createVirtualAccount,
  getVirtualAccount,
  handleRefundUser,
  handleDefundUser,
};
