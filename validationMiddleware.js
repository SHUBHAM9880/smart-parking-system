// Validation middleware for request data

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone validation regex (Indian format)
const phoneRegex = /^(\+91|91|0)?[6789]\d{9}$/;

// Password validation (at least 8 characters, 1 uppercase, 1 lowercase, 1 number)
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;

// Validate registration data
const validateRegistration = (req, res, next) => {
  const { name, email, password, phone } = req.body;
  const errors = [];

  // Name validation
  if (!name || name.trim().length < 2) {
    errors.push('Name must be at least 2 characters long');
  }

  if (name && name.length > 100) {
    errors.push('Name must be less than 100 characters');
  }

  // Email validation
  if (!email) {
    errors.push('Email is required');
  } else if (!emailRegex.test(email)) {
    errors.push('Please provide a valid email address');
  }

  // Password validation
  if (!password) {
    errors.push('Password is required');
  } else if (!passwordRegex.test(password)) {
    errors.push('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number');
  }

  // Phone validation (optional)
  if (phone && !phoneRegex.test(phone)) {
    errors.push('Please provide a valid phone number');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Validate login data
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  // Email validation
  if (!email) {
    errors.push('Email is required');
  } else if (!emailRegex.test(email)) {
    errors.push('Please provide a valid email address');
  }

  // Password validation
  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Validate booking data
const validateBooking = (req, res, next) => {
  const {
    spot_id, vehicle_number, vehicle_color, mobile_number, duration
  } = req.body;
  const errors = [];

  // Spot ID validation
  if (!spot_id || isNaN(spot_id)) {
    errors.push('Valid parking spot ID is required');
  }

  // Vehicle number validation
  if (!vehicle_number || vehicle_number.trim().length < 4) {
    errors.push('Vehicle number must be at least 4 characters long');
  }

  if (vehicle_number && vehicle_number.length > 20) {
    errors.push('Vehicle number must be less than 20 characters');
  }

  // Vehicle color validation
  if (!vehicle_color || vehicle_color.trim().length < 2) {
    errors.push('Vehicle color is required');
  }

  // Mobile number validation
  if (!mobile_number) {
    errors.push('Mobile number is required');
  } else if (!phoneRegex.test(mobile_number)) {
    errors.push('Please provide a valid mobile number');
  }

  // Duration validation
  if (!duration || isNaN(duration) || duration <= 0) {
    errors.push('Valid duration (in hours) is required');
  }

  if (duration && duration > 24) {
    errors.push('Duration cannot exceed 24 hours');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Validate parking spot data
const validateParkingSpot = (req, res, next) => {
  const {
    name, address, latitude, longitude, total_spots, price_per_hour
  } = req.body;
  const errors = [];

  // Name validation
  if (!name || name.trim().length < 3) {
    errors.push('Parking spot name must be at least 3 characters long');
  }

  // Address validation
  if (!address || address.trim().length < 10) {
    errors.push('Address must be at least 10 characters long');
  }

  // Latitude validation
  if (!latitude || isNaN(latitude) || latitude < -90 || latitude > 90) {
    errors.push('Valid latitude is required (-90 to 90)');
  }

  // Longitude validation
  if (!longitude || isNaN(longitude) || longitude < -180 || longitude > 180) {
    errors.push('Valid longitude is required (-180 to 180)');
  }

  // Total spots validation
  if (!total_spots || isNaN(total_spots) || total_spots <= 0) {
    errors.push('Total spots must be a positive number');
  }

  // Price validation
  if (!price_per_hour || isNaN(price_per_hour) || price_per_hour <= 0) {
    errors.push('Price per hour must be a positive number');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Validate review data
const validateReview = (req, res, next) => {
  const { rating, comment } = req.body;
  const errors = [];

  // Rating validation
  if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
    errors.push('Rating must be between 1 and 5');
  }

  // Comment validation (optional but if provided, should be meaningful)
  if (comment && comment.trim().length < 10) {
    errors.push('Comment must be at least 10 characters long');
  }

  if (comment && comment.length > 1000) {
    errors.push('Comment must be less than 1000 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Validate payment data
const validatePayment = (req, res, next) => {
  const { amount, payment_method } = req.body;
  const errors = [];

  // Amount validation
  if (!amount || isNaN(amount) || amount <= 0) {
    errors.push('Valid amount is required');
  }

  // Payment method validation
  const validMethods = ['credit_card', 'debit_card', 'upi', 'wallet', 'net_banking', 'cash'];
  if (!payment_method || !validMethods.includes(payment_method)) {
    errors.push(`Payment method must be one of: ${validMethods.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Sanitize input data
const sanitizeInput = (req, res, next) => {
  // Remove any potential XSS or injection attempts
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  };

  const sanitizeObject = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body) {
    sanitizeObject(req.body);
  }

  if (req.query) {
    sanitizeObject(req.query);
  }

  next();
};

// Rate limiting validation
const validateRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const clientId = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (requests.has(clientId)) {
      const clientRequests = requests.get(clientId).filter(time => time > windowStart);
      requests.set(clientId, clientRequests);
    }

    // Check current requests
    const currentRequests = requests.get(clientId) || [];
    
    if (currentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retry_after: Math.ceil(windowMs / 1000)
      });
    }

    // Add current request
    currentRequests.push(now);
    requests.set(clientId, currentRequests);

    next();
  };
};

module.exports = {
  validateRegistration,
  validateLogin,
  validateBooking,
  validateParkingSpot,
  validateReview,
  validatePayment,
  sanitizeInput,
  validateRateLimit
};