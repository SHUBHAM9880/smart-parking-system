// Error handling middleware

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

// Handle different types of errors
const handleDatabaseError = (error) => {
  let message = 'Database operation failed';
  let statusCode = 500;

  // MySQL specific errors
  if (error.code === 'ER_DUP_ENTRY') {
    message = 'Duplicate entry. This record already exists.';
    statusCode = 409;
  } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    message = 'Referenced record not found.';
    statusCode = 400;
  } else if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    message = 'Cannot delete record. It is referenced by other records.';
    statusCode = 400;
  } else if (error.code === 'ER_DATA_TOO_LONG') {
    message = 'Data too long for field.';
    statusCode = 400;
  } else if (error.code === 'ER_BAD_NULL_ERROR') {
    message = 'Required field cannot be null.';
    statusCode = 400;
  } else if (error.code === 'ECONNREFUSED') {
    message = 'Database connection failed.';
    statusCode = 503;
  }

  return new AppError(message, statusCode);
};

const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again.', 401);
};

const handleJWTExpiredError = () => {
  return new AppError('Your token has expired. Please log in again.', 401);
};

const handleValidationError = (error) => {
  const errors = Object.values(error.errors).map(err => err.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

// Send error response in development
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    error: err.message,
    status: err.status,
    stack: err.stack,
    details: err
  });
};

// Send error response in production
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
  } else {
    // Programming or other unknown error: don't leak error details
    console.error('ERROR 💥', err);
    
    res.status(500).json({
      success: false,
      error: 'Something went wrong!'
    });
  }
};

// Main error handling middleware
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (error.code && error.code.startsWith('ER_')) {
      error = handleDatabaseError(error);
    } else if (error.name === 'JsonWebTokenError') {
      error = handleJWTError();
    } else if (error.name === 'TokenExpiredError') {
      error = handleJWTExpiredError();
    } else if (error.name === 'ValidationError') {
      error = handleValidationError(error);
    }

    sendErrorProd(error, res);
  }
};

// Catch async errors
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Handle unhandled routes
const handleNotFound = (req, res, next) => {
  // Silently ignore browser static file requests (handled by React dev server)
  const staticFiles = ['/manifest.json', '/favicon.ico', '/logo192.png', '/logo512.png', '/robots.txt'];
  if (staticFiles.includes(req.path)) {
    return res.status(404).end();
  }
  const err = new AppError(`Can't find ${req.originalUrl} on this server!`, 404);
  next(err);
};

// Log errors
const logError = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  console.error(`[${timestamp}] ${method} ${url} - ${ip} - ${userAgent}`);
  console.error(`Error: ${err.message}`);
  
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  next(err);
};

// Security error handler
const handleSecurityError = (err, req, res, next) => {
  // Log security-related errors
  if (err.statusCode === 401 || err.statusCode === 403) {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    console.warn(`[SECURITY] ${timestamp} - Unauthorized access attempt from ${ip} to ${req.originalUrl}`);
  }

  next(err);
};

// Database connection error handler
const handleDatabaseConnectionError = (err, req, res, next) => {
  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Database connection lost. Attempting to reconnect...');
    
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again later.',
      code: 'DATABASE_UNAVAILABLE'
    });
  }

  next(err);
};

// Validation error formatter
const formatValidationError = (errors) => {
  if (Array.isArray(errors)) {
    return errors.join(', ');
  }
  
  if (typeof errors === 'object') {
    return Object.values(errors).join(', ');
  }
  
  return errors.toString();
};

module.exports = {
  AppError,
  globalErrorHandler,
  catchAsync,
  handleNotFound,
  logError,
  handleSecurityError,
  handleDatabaseConnectionError,
  formatValidationError
};