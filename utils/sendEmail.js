const nodemailer = require("nodemailer");
require("dotenv").config();

const sendEmail = async (options) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      logger: true,
      debug: true,
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: options.email,
      subject: options.subject,
      text: options.message,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.response);
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
  }
};

module.exports = sendEmail;
