function calculateDiscount(amount, type = "fixed", value = 2) {
  if (type === "fixed") {
    return Math.max(amount - value, 0); // prevents negative
  }
  if (type === "percentage") {
    return Math.max(amount - (amount * value) / 100, 0);
  }
  return amount;
}

module.exports = calculateDiscount;
