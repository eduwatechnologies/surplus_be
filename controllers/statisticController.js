const Transaction = require("../models/transactionModel");
const User = require("../models/userModel");

// Utility: get start date for filter
const getDateRange = (filter) => {
  let startDate,
    endDate = new Date();

  switch (filter) {
    case "day":
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      break;
    case "week":
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "month":
      startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      break;
    case "year":
      startDate = new Date(new Date().getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(0); // all-time
  }

  return { startDate, endDate };
};

// Get overall statistics with filter
const getOverallStats = async (req, res) => {
  try {
    const { filter = "all" } = req.query;
    const { startDate, endDate } = getDateRange(filter);

    const totalUsers = await User.countDocuments();
    const totalTransactions = await Transaction.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    });

    const totalRevenue = await Transaction.aggregate([
      {
        $match: {
          status: "success",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalUserBalance = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$balance" } } },
    ]);

    res.json({
      success: true,
      filter,
      data: {
        totalUsers,
        totalUserBalance: totalUserBalance[0]?.total || 0,
        totalTransactions,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("❌ Error in getOverallStats:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get service breakdown with filter
const getServiceBreakdown = async (req, res) => {
  try {
    const { filter = "all" } = req.query;
    const { startDate, endDate } = getDateRange(filter);

    const breakdown = await Transaction.aggregate([
      {
        $match: {
          status: "success",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$service",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    res.json({ success: true, filter, data: breakdown });
  } catch (error) {
    console.error("❌ Error in getServiceBreakdown:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get daily stats (time-series chart) with filter
const getDailyStats = async (req, res) => {
  try {
    const { filter = "all" } = req.query;
    const { startDate, endDate } = getDateRange(filter);

    const daily = await Transaction.aggregate([
      {
        $match: {
          status: "success",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ success: true, filter, data: daily });
  } catch (error) {
    console.error("❌ Error in getDailyStats:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = {
  getOverallStats,
  getServiceBreakdown,
  getDailyStats,
};
