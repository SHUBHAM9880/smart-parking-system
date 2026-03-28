// Comprehensive validation utility for Ezy-Parking app

export const ValidationRules = {
  // Phone number validation - exactly 10 digits
  phone: {
    pattern: /^[6-9]\d{9}$/,
    message: 'Phone number must be exactly 10 digits starting with 6, 7, 8, or 9'
  },

  // Email validation
  email: {
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    message: 'Please enter a valid email address'
  },

  // Name validation - only letters and spaces
  name: {
    pattern: /^[a-zA-Z\s]{2,50}$/,
    message: 'Name must contain only letters and spaces (2-50 characters)'
  },

  // Password validation - minimum 8 characters with at least one letter and one number
  password: {
    pattern: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/,
    message: 'Password must be at least 8 characters with at least one letter and one number'
  },

  // Vehicle number validation - Indian format
  vehicleNumber: {
    pattern: /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{1,4}$/,
    message: 'Vehicle number format: XX00XX0000 (e.g., KA01AB1234)'
  },

  // Vehicle color validation
  vehicleColor: {
    pattern: /^[a-zA-Z\s]{2,20}$/,
    message: 'Vehicle color must contain only letters (2-20 characters)'
  },

  // OTP validation - 6 digits
  otp: {
    pattern: /^\d{6}$/,
    message: 'OTP must be exactly 6 digits'
  },

  // Duration validation - positive number
  duration: {
    pattern: /^[1-9]\d*$/,
    message: 'Duration must be a positive number'
  },

  // City validation
  city: {
    pattern: /^[a-zA-Z\s]{2,50}$/,
    message: 'City name must contain only letters and spaces (2-50 characters)'
  }
};

// Validation functions
export const validateField = (value, rule) => {
  if (!value || value.trim() === '') {
    return { isValid: false, message: 'This field is required' };
  }

  if (rule.pattern && !rule.pattern.test(value.trim())) {
    return { isValid: false, message: rule.message };
  }

  return { isValid: true, message: '' };
};

export const validatePhone = (phone) => {
  return validateField(phone, ValidationRules.phone);
};

export const validateEmail = (email) => {
  return validateField(email, ValidationRules.email);
};

export const validateName = (name) => {
  return validateField(name, ValidationRules.name);
};

export const validatePassword = (password) => {
  return validateField(password, ValidationRules.password);
};

export const validateVehicleNumber = (vehicleNumber) => {
  return validateField(vehicleNumber, ValidationRules.vehicleNumber);
};

export const validateVehicleColor = (vehicleColor) => {
  return validateField(vehicleColor, ValidationRules.vehicleColor);
};

export const validateOTP = (otp) => {
  return validateField(otp, ValidationRules.otp);
};

export const validateDuration = (duration) => {
  return validateField(duration, ValidationRules.duration);
};

export const validateCity = (city) => {
  return validateField(city, ValidationRules.city);
};

// Form validation helper
export const validateForm = (formData, rules) => {
  const errors = {};
  let isValid = true;

  Object.keys(rules).forEach(field => {
    if (formData[field] !== undefined) {
      const validation = validateField(formData[field], rules[field]);
      if (!validation.isValid) {
        errors[field] = validation.message;
        isValid = false;
      }
    }
  });

  return { isValid, errors };
};

// Real-time input formatting
export const formatPhoneInput = (value) => {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');
  // Limit to 10 digits
  return digits.slice(0, 10);
};

export const formatVehicleNumber = (value) => {
  // Convert to uppercase and remove spaces
  return value.toUpperCase().replace(/\s/g, '');
};

export const formatName = (value) => {
  // Capitalize first letter of each word
  return value.replace(/\b\w/g, l => l.toUpperCase());
};

// Input validation with real-time feedback
export const createValidatedInput = (value, rule, onChange) => {
  const validation = validateField(value, rule);
  
  return {
    value,
    isValid: validation.isValid,
    error: validation.message,
    onChange: (newValue) => {
      onChange(newValue);
    },
    className: validation.isValid ? 'valid' : 'invalid'
  };
};

export default {
  ValidationRules,
  validateField,
  validatePhone,
  validateEmail,
  validateName,
  validatePassword,
  validateVehicleNumber,
  validateVehicleColor,
  validateOTP,
  validateDuration,
  validateCity,
  validateForm,
  formatPhoneInput,
  formatVehicleNumber,
  formatName,
  createValidatedInput
};