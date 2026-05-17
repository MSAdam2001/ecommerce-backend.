// ecommerce-backend/middleware/auth.js  ← place this in your Express backend folder
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/* ─────────────────────────────────────────────
   protect  —  verifies JWT, attaches req.user
───────────────────────────────────────────── */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorised — no token.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request (exclude password)
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorised — user not found.' });
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired — please log in again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    res.status(401).json({ message: 'Not authorised.' });
  }
};

/* ─────────────────────────────────────────────
   adminOnly  —  use AFTER protect
───────────────────────────────────────────── */
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  res.status(403).json({ message: 'Admin access only.' });
};

module.exports = { protect, adminOnly };