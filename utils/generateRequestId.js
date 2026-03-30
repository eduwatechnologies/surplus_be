function generateRequestId() {
  const now = new Date();

  // Set time zone to Africa/Lagos (GMT+1)
  now.setMinutes(now.getMinutes() + now.getTimezoneOffset() + 60);

  // Format date as YYYYMMDDHHMM
  const timestamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0");

  // Generate a random alphanumeric string
  const randomString = Math.random().toString(36).substring(2, 10);

  return timestamp + randomString;
}

module.exports = { generateRequestId };
