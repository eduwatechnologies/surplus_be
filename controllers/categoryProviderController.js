const CategoryProvider = require("../models/testingCategoryProviderModel");

const getCategoriesBySubServiceId = async (req, res) => {
  try {
    const { subServiceId } = req.params;
    const categories = await CategoryProvider.find({ subServiceId });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAllCategoryProviders = async (req, res) => {
  try {
    const mappings = await CategoryProvider.find();
    res.json(mappings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createCategoryProvider = async (req, res) => {
  try {
    const { subServiceId, network, category, provider, providerCodes, status } =
      req.body;

    const mapping = await CategoryProvider.create({
      subServiceId,
      network: network.toUpperCase(),
      category: category.toUpperCase(),
      provider,
      providerCodes,
      status: status ?? true,
    });

    res.status(201).json(mapping);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateCategoryProvider = async (req, res) => {
  try {
    const { network, category, provider, providerCodes, status } = req.body;

    const mapping = await CategoryProvider.findById(req.params.id);
    if (!mapping) {
      return res
        .status(404)
        .json({ error: "Category-Provider mapping not found" });
    }

    if (network) mapping.network = network.toUpperCase();
    if (category) mapping.category = category.toUpperCase();
    if (provider) mapping.provider = provider;
    if (providerCodes) mapping.providerCodes = providerCodes;
    if (status !== undefined) mapping.status = status;

    await mapping.save();

    res.json({ message: "Mapping updated successfully", data: mapping });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteCategoryProvider = async (req, res) => {
  try {
    const mapping = await CategoryProvider.findByIdAndDelete(req.params.id);
    if (!mapping) return res.status(404).json({ error: "Mapping not found" });
    res.json({ message: "Mapping deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  getCategoriesBySubServiceId,
  getAllCategoryProviders,
  deleteCategoryProvider,
  updateCategoryProvider,
  createCategoryProvider,
};
