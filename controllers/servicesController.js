const Service = require("../models/servicesModel");

// CREATE
const createService = async (req, res) => {
  try {
    const service = new Service(req.body);
    await service.save();
    res
      .status(201)
      .json({ message: "Service created successfully", data: service });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET ALL
const getServices = async (req, res) => {
  try {
    const services = await Service.find();
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET ONE
const getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE
const updateService = async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json({ message: "Service updated", data: service });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE
const deleteService = async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json({ message: "Service deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// TOGGLE STATUS (ON/OFF)
const toggleServiceStatus = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });

    service.status = !service.status;
    await service.save();

    res.json({
      message: `Service status changed to ${service.status}`,
      data: service,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET all services with their subservices
const getServicesWithSubServices = async (req, res) => {
  try {
    const services = await Service.aggregate([
      {
        $lookup: {
          from: "subservices",
          let: { serviceId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$serviceId", "$$serviceId"] },
              },
            },
            // For each subService, lookup servicePlans
            {
              $lookup: {
                from: "serviceplans", // actual MongoDB collection name
                let: { subServiceId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$subServiceId", "$$subServiceId"] },
                    },
                  },
                  { $sort: { createdAt: 1 } },
                ],
                as: "servicePlans",
              },
            },
          ],
          as: "subServices",
        },
      },
      {
        $sort: { createdAt: 1 },
      },
    ]);

    res.json(services);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching services with subservices and servicePlans",
      error: error.message,
    });
  }
};

module.exports = {
  deleteService,
  updateService,
  getServiceById,
  getServices,
  createService,
  getServicesWithSubServices,
  toggleServiceStatus,
};
