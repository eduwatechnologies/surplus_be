const SubService = require("../models/subServicesModel");

// CREATE
const createSubService = async (req, res) => {
  try {
    const sub = new SubService(req.body);
    await sub.save();
    res.status(201).json({ message: "SubService created", data: sub });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET ALL (optional filter by serviceId)
const getSubServices = async (req, res) => {
  try {
    const { serviceId } = req.query;
    const filter = serviceId ? { serviceId } : {};
    const subs = await SubService.find(filter).populate("serviceId");
    res.json(subs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET ONE
const getSubServiceById = async (req, res) => {
  try {
    const sub = await SubService.findById(req.params.id).populate("serviceId");
    if (!sub) return res.status(404).json({ message: "SubService not found" });
    res.json(sub);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE
const updateSubService = async (req, res) => {
  try {
    const sub = await SubService.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!sub) return res.status(404).json({ message: "SubService not found" });
    res.json({ message: "SubService updated", data: sub });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE
const deleteSubService = async (req, res) => {
  try {
    const sub = await SubService.findByIdAndDelete(req.params.id);
    if (!sub) return res.status(404).json({ message: "SubService not found" });
    res.json({ message: "SubService deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// TOGGLE STATUS (ON/OFF)
const toggleSubServiceStatus = async (req, res) => {
  try {
    const sub = await SubService.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: "SubService not found" });

    sub.status = !sub.status;
    await sub.save();

    res.json({
      message: `SubService status changed to ${sub.status}`,
      data: sub,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/subservices/:id/switch-provider
const switchProvider = async (req, res) => {
  try {
    const { provider } = req.body;
    const sub = await SubService.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: "SubService not found" });

    sub.provider = provider;
    await sub.save();

    res.json({
      message: `SubService provider updated to ${sub.provider}`,
      data: sub,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  toggleSubServiceStatus,
  deleteSubService,
  updateSubService,
  getSubServiceById,
  createSubService,
  getSubServices,
  switchProvider,
};
