const mongoose = require('mongoose');

// Database schema for user data, including (PII)
// PII fields: name, email, phone, address, dob, ipAddress
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: { type: String },
  address: { type: String },
  dob: { type: Date },
  ipAddress: { type: String },
});

const User = mongoose.model(
  'User',
  userSchema,
);

module.exports = User;
