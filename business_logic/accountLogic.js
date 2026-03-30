const {
  createVirtualAccount,
} = require("../services/payments/billstackService");
const logger = require("../utils/logger");

const createVirtualAccountForUser = async (user) => {
  try {
    const reference = `VA-${Date.now()}`;
    const virtualAccountResponse = await createVirtualAccount({
      email: user.email,
      reference,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      bank: "PALMPAY",
    });

    if (
      virtualAccountResponse.success &&
      virtualAccountResponse.data?.data?.account
    ) {
      const account = virtualAccountResponse.data.data.account[0]; // Correct extraction

      if (account) {
        const { account_number, bank_name, account_name } = account;

        // 🔹 Update User Document with Virtual Account Info
        user.account = {
          bankName: bank_name,
          accountNumber: account_number,
          accountName: account_name,
          virtualAccountId: reference,
        };

        await user.save(); // Update user in DB
        logger.info("Virtual account created successfully", {
          email: user.email,
          accountNumber: account_number,
        });
      } else {
        logger.error("Virtual account creation failed: No valid account data", {
          email: user.email,
        });
      }
    } else {
      logger.error("Failed to create virtual account", {
        email: user.email,
        error: virtualAccountResponse,
      });
    }
  } catch (error) {
    console.log(error);
    logger.error("Virtual account creation error", {
      email: user.email,
      error: error.message,
    });
  }
};

module.exports = { createVirtualAccountForUser };
