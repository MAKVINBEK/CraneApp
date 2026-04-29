const jwt = require('jsonwebtoken');
const logger = require('../services/logger');

/**
 * Authentication Middleware
 * Validates JWT tokens for protected routes
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided or invalid format'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET is not configured');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Authentication system not properly configured'
      });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      userId: decoded.userId,
      phone: decoded.phone,
      username: decoded.username
    };

    req.headers['x-user-id'] = decoded.userId;

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token verification failed'
      });
    }

    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error'
    });
  }
};

/**
 * Optional Auth Middleware
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (!process.env.JWT_SECRET) {
        logger.error('JWT_SECRET is not configured');
        return next();
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.user = {
        userId: decoded.userId,
        phone: decoded.phone,
        username: decoded.username
      };
      req.headers['x-user-id'] = decoded.userId;
    }

    next();
  } catch (error) {
    next();
  }
};

// ✅ ВАЖНО: Экспортируем функцию напрямую, НЕ объект!
module.exports = authMiddleware;
module.exports.optionalAuthMiddleware = optionalAuthMiddleware;