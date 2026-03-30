const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: String,
    module: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Permission", permissionSchema);
