const mongoose = require("mongoose");
require("dotenv").config();
const Role = require("../models/roleModel");
const Permission = require("../models/permissionModel");
const Staff = require("../models/staffModel");

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is required");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  const basePermissions = [
    { id: "users.read", name: "Read Users", module: "users" },
    { id: "users.write", name: "Manage Users", module: "users" },
    { id: "services.read", name: "Read Services", module: "services" },
    { id: "services.write", name: "Manage Services", module: "services" },
    { id: "transactions.read", name: "Read Transactions", module: "transactions" },
    { id: "analytics.read", name: "View Analytics", module: "analytics" },
  ];

  const existing = await Permission.find({ id: { $in: basePermissions.map((p) => p.id) } });
  const existingIds = new Set(existing.map((p) => p.id));
  const toCreate = basePermissions.filter((p) => !existingIds.has(p.id));
  if (toCreate.length) {
    await Permission.insertMany(toCreate);
  }
  const allPerms = await Permission.find({});

  async function upsertRole(name, description, predicate) {
    let role = await Role.findOne({ name });
    if (!role) {
      role = new Role({ name, description, permissions: [] });
    }
    role.permissions = allPerms.filter(predicate).map((p) => p._id);
    await role.save();
  }

  await upsertRole("admin", "Administrator", () => true);
  await upsertRole("manager", "Manager", (p) => p.id.endsWith(".read"));
  await upsertRole("support", "Support", (p) => p.id.endsWith(".read") && p.module !== "analytics");

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  let admin = await Staff.findOne({ email: adminEmail });
  if (!admin) {
    admin = new Staff({
      name: "Admin",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      status: "active",
    });
    await admin.save();
  }

  console.log("Seeding completed");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

