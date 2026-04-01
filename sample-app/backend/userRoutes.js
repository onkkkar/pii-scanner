const express = require('express');
const router = express.Router();
const User = require('./userModel');
const logger = require('./logger');

// POST /api/users/register
// Entry point for user registration — receives PII from React form
router.post(
  '/register',
  async (req, res) => {
    const {
      name,
      email,
      phone,
      address,
      dob,
    } = req.body;

    // validation: basic email format check before saving
    if (!email.includes('@')) {
      return res
        .status(400)
        .json({
          error: 'Invalid email',
        });
    }

    // transformation: strip non-numeric characters from phone
    // ex: "(123) 456-7890" → "1234567890"
    const formattedPhone =
      phone.replace(/\D/g, '');

    // sink: persist user to MongoDB
    // all PII fields written to users collection
    const user = await User.create({
      name,
      email,
      phone: formattedPhone,
      address,
      dob,
    });

    // sink: write to server logs
    // note: email is logged here — flagged as PII exposure in logs
    logger.info(
      `User registered: ${email}`,
    );

    res.json(user);
  },
);

module.exports = router;
