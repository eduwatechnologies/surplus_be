const PaymentProvider = require("../models/paymentProviderModel");

// Create
exports.createProvider = async (req, res) => {
  try {
    const provider = new PaymentProvider(req.body);
    await provider.save();
    res.status(201).json(provider);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Read all
exports.getProviders = async (req, res) => {
  try {
    const providers = await PaymentProvider.find().sort({ createdAt: -1 });
    res.json(providers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Read one
exports.getProviderById = async (req, res) => {
  try {
    const provider = await PaymentProvider.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: "Not found" });
    res.json(provider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update
exports.updateProvider = async (req, res) => {
  try {
    const updated = await PaymentProvider.findByIdAndUpdate(
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
exports.deleteProvider = async (req, res) => {
  try {
    const deleted = await PaymentProvider.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
