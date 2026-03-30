const NetworkProvider = require("../models/apiProviderModel");

// Create
const createProvider = async (req, res) => {
  try {
    const newProvider = await NetworkProvider.create(req.body);
    res.status(201).json(newProvider);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get All
const getAllProviders = async (req, res) => {
  try {
    const providers = await NetworkProvider.find();
    res.json(providers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get One
const getProviderById = async (req, res) => {
  try {
    const provider = await NetworkProvider.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: "Not found" });
    res.json(provider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update
const updateProvider = async (req, res) => {
  try {
    const updated = await NetworkProvider.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete
const deleteProvider = async (req, res) => {
  try {
    const deleted = await NetworkProvider.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createProvider,
  getAllProviders,
  updateProvider,
  deleteProvider,
  getProviderById,
};
