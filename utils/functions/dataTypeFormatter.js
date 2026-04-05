
 function getDataTypeFromPlanId(planId) {
  planId = String(planId || "");

  // Common mapping patterns for all networks
  const mapping = [
    { startsWith: "_SME", type: "SME" },
    { startsWith: "_DT", type: "DATA TRANSFER" },
    { startsWith: "_AWOOF", type: "AWOOF" },
    { startsWith: "_DG_", type: "DIRECT GIFTING" },
    { startsWith: "_CG_", type: "CORPORATE GIFTING" },
    { includes: "_DG_THRYVE_DATA", type: "THRYVE DATA" },
    { includes: "_DG_THRYVE_TALK", type: "THRYVE TALK" },
    { includes: "_DG_XTRADATA", type: "XTRADATA" },
  ];

  // Loop through mapping rules
  for (const rule of mapping) {
    if (rule.startsWith && planId.startsWithAnyNetwork(rule.startsWith)) {
      return rule.type;
    }
    if (rule.includes && planId.includes(rule.includes)) {
      return rule.type;
    }
  }

  return "UNKNOWN";
}

// Helper: match across all network prefixes
String.prototype.startsWithAnyNetwork = function (suffix) {
  const networks = ["MTN", "AIRTEL", "GLO", "9MOBILE"];
  return networks.some((net) => this.startsWith(net + suffix));
};

module.exports = getDataTypeFromPlanId;
