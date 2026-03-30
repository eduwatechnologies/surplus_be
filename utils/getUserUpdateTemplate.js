const getSecurityUpdateTemplate = ({ type }) => {
  const subject =
    type === "password" ? "Your Password Was Updated" : "Your PIN Was Updated";

  const text =
    type === "password"
      ? "Your password was successfully updated. If this wasn't you, please reset it immediately or contact support."
      : "Your PIN was successfully updated. If this wasn't you, please change it immediately or contact support.";

  const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>${subject}</h2>
        <p>${text}</p>
        <p style="margin-top:20px;">Thank you,<br/>Your App Team</p>
      </div>
    `;

  return { subject, text, html };
};

module.exports = {
  getSecurityUpdateTemplate,
};
