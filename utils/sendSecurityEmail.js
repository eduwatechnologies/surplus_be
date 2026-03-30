// utils/emailTemplates.js

const sendEmail = require("./sendEmail");

const sendSecurityUpdateEmail = async ({ email, type }) => {
  const title =
    type === "password"
      ? "Password Updated Successfully"
      : "PIN Code Updated Successfully";

  const message = `Your ${type} has been successfully updated. If you did not perform this action, please contact support immediately.`;

  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2>${title}</h2>
      <p>${message}</p>
      <p style="margin-top: 20px;">Thank you,<br/>Your Support Team</p>
    </div>
  `;

  await sendEmail({
    email,
    subject: title,
    message,
    html,
  });
};

module.exports = {
  sendSecurityUpdateEmail,
};
