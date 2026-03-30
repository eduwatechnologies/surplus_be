// Converts "1GB", "500MB", "2.5 GB", "1000mb" into MB
function parseBundleSize(bundle) {
  if (!bundle) return null;
  const str = bundle.toString().toLowerCase().replace(/\s+/g, '');
  const match = str.match(/([\d.]+)\s*(gb|mb)/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2];
  return unit === 'gb' ? value * 1024 : value;
}

module.exports = { parseBundleSize };
