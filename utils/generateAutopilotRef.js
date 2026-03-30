
function generateAutopilotReference(){
  const now = new Date();

  // Convert to Africa/Lagos (GMT+1)
  const lagosOffset = 60; // in minutes (GMT+1)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const lagosTime = new Date(utc + lagosOffset * 60000);

  const pad = (n)=> n.toString().padStart(2, '0');

  const datePrefix = `${lagosTime.getFullYear()}${pad(lagosTime.getMonth() + 1)}${pad(lagosTime.getDate())}${pad(lagosTime.getHours())}${pad(lagosTime.getMinutes())}`;

  const randomString = generateRandomAlphanumeric(13 + Math.floor(Math.random() * 6)); // ensures total length is between 25–30

  return datePrefix + randomString;
}

function generateRandomAlphanumeric(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

module.exports =generateAutopilotReference;

