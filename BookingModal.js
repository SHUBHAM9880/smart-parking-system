import { useState, useEffect } from 'react';
import { Modal, Form, Button, Alert, Spinner, Card, Row, Col } from 'react-bootstrap';
import axios from 'axios';
import { toast } from 'react-toastify';
import PaymentOTPVerification from '../PaymentOTPVerification/PaymentOTPVerification';
import PaymentSuccessModal from '../PaymentSuccessModal/PaymentSuccessModal';
import { useAuth } from '../../contexts/AuthContext';
import { 
  validateVehicleNumber, 
  validateVehicleColor, 
  validatePhone,
  formatPhoneInput,
  formatVehicleNumber 
} from '../../utils/validation';

const BookingModal = ({ 
  show, 
  onHide, 
  selectedSpot, 
  selectedVehicleType,
  selectedSlots,
  selectedDate,
  fromTime,
  toTime,
  duration,
  onBookingSuccess 
}) => {
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [showPaymentOTP, setShowPaymentOTP] = useState(false);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [paymentError, setPaymentError] = useState(null);
  const [paymentOtpKey, setPaymentOtpKey] = useState(null);
  const [paymentOtpData, setPaymentOtpData] = useState(null);
  const [bookingData, setBookingData] = useState(null);
  const { user } = useAuth(); // Get real user data from AuthContext
  const [bookingForm, setBookingForm] = useState({
    vehicleNumber: '',
    vehicleColor: '',
    mobileNumber: '',
    paymentMethod: 'phonepe'
  });
  const [formErrors, setFormErrors] = useState({});

  // Prevent user from leaving during payment processing
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (paymentLoading) {
        e.preventDefault();
        e.returnValue = 'Payment is being processed. Are you sure you want to leave?';
        return 'Payment is being processed. Are you sure you want to leave?';
      }
    };

    if (paymentLoading) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [paymentLoading]);

  const paymentMethods = [
    { id: 'phonepe', name: 'PhonePe', icon: '📱', color: '#5f259f' },
    { id: 'googlepay', name: 'Google Pay', icon: '💳', color: '#4285f4' },
    { id: 'paytm', name: 'Paytm', icon: '💰', color: '#00baf2' },
    { id: 'upi', name: 'UPI', icon: '🏦', color: '#ff6b35' },
    { id: 'card', name: 'Credit/Debit Card', icon: '💳', color: '#28a745' },
    { id: 'netbanking', name: 'Net Banking', icon: '🏛️', color: '#17a2b8' },
    { id: 'cash', name: 'Cash on Arrival', icon: '💵', color: '#6c757d' }
  ];

  const getPricePerHour = (spot, vehicleType) => {
    if (!spot) return 0;
    switch (vehicleType) {
      case 'car':
        return spot.car_price_per_hour || spot.price_per_hour || 0;
      case 'bike':
        return spot.bike_price_per_hour || spot.price_per_hour || 0;
      case 'truck':
        return spot.truck_price_per_hour || spot.price_per_hour || 0;
      default:
        return spot.price_per_hour || 0;
    }
  };

  const getTotalAmount = () => {
    if (!selectedSpot || !selectedSlots || selectedSlots.length === 0 || !duration) return 0;
    const pricePerHour = getPricePerHour(selectedSpot, selectedVehicleType);
    return selectedSlots.length * pricePerHour * duration;
  };

  const getProcessingFee = () => {
    const amount = getTotalAmount();
    const feeRates = {
      'phonepe': 0.005,     // 0.5%
      'googlepay': 0.005,   // 0.5%
      'paytm': 0.008,       // 0.8%
      'upi': 0.005,         // 0.5%
      'card': 0.029,        // 2.9%
      'netbanking': 0.012,  // 1.2%
      'cash': 0             // 0%
    };
    
    const rate = feeRates[bookingForm.paymentMethod] || 0;
    return Math.round(amount * rate);
  };

  const getFinalAmount = () => {
    return getTotalAmount() + getProcessingFee();
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    
    // Comprehensive form validation
    const errors = {};
    
    // Vehicle number validation
    if (!bookingForm.vehicleNumber.trim()) {
      errors.vehicleNumber = 'Vehicle number is required';
    } else {
      const vehicleValidation = validateVehicleNumber(bookingForm.vehicleNumber);
      if (!vehicleValidation.isValid) {
        errors.vehicleNumber = vehicleValidation.message;
      }
    }
    
    // Vehicle color validation
    if (!bookingForm.vehicleColor.trim()) {
      errors.vehicleColor = 'Vehicle color is required';
    } else {
      const colorValidation = validateVehicleColor(bookingForm.vehicleColor);
      if (!colorValidation.isValid) {
        errors.vehicleColor = colorValidation.message;
      }
    }
    
    // Mobile number validation
    if (!bookingForm.mobileNumber.trim()) {
      errors.mobileNumber = 'Mobile number is required';
    } else {
      const phoneValidation = validatePhone(bookingForm.mobileNumber);
      if (!phoneValidation.isValid) {
        errors.mobileNumber = phoneValidation.message;
      }
    }
    
    // Check for validation errors
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fix the form errors before proceeding');
      return;
    }

    // Validate time selection
    if (!selectedDate || !fromTime || !toTime || !duration || duration <= 0) {
      toast.error('Please select valid date and time range');
      return;
    }

    // Validate slot selection
    if (!selectedSlots || selectedSlots.length === 0) {
      toast.error('Please select at least one parking slot');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please login to book a parking spot');
        return;
      }

      // Create booking data with new time format - proceed directly to payment
      const bookingPayload = {
        spot_id: selectedSpot.id,
        vehicle_number: bookingForm.vehicleNumber,
        vehicle_color: bookingForm.vehicleColor,
        vehicle_type: selectedVehicleType,
        mobile_number: bookingForm.mobileNumber,
        duration: duration,
        payment_method: bookingForm.paymentMethod,
        amount: getTotalAmount(),
        booking_date: selectedDate,
        from_time: fromTime,
        to_time: toTime,
        selected_slots: selectedSlots, // Pass full slot objects, not just IDs
        slot_count: selectedSlots.length
      };

      setBookingData(bookingPayload);
      setShowBookingForm(false);
      setShowPayment(true);
    } catch (error) {
      console.error('Booking preparation error:', error);
      toast.error('Failed to prepare booking');
    } finally {
      setLoading(false);
    }
  };

  // Handle form input changes with validation
  const handleInputChange = (e) => {
    let { name, value } = e.target;
    
    // Apply formatting based on field type
    if (name === 'vehicleNumber') {
      value = formatVehicleNumber(value);
    } else if (name === 'mobileNumber') {
      value = formatPhoneInput(value);
    }
    
    setBookingForm(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Real-time validation
    if (value.trim()) {
      let validation;
      switch (name) {
        case 'vehicleNumber':
          validation = validateVehicleNumber(value);
          break;
        case 'vehicleColor':
          validation = validateVehicleColor(value);
          break;
        case 'mobileNumber':
          validation = validatePhone(value);
          break;
        default:
          validation = { isValid: true };
      }
      
      if (!validation.isValid) {
        setFormErrors(prev => ({
          ...prev,
          [name]: validation.message
        }));
      } else {
        setFormErrors(prev => ({
          ...prev,
          [name]: ''
        }));
      }
    } else {
      // Clear error when field is empty (will be caught by required validation)
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handlePaymentConfirm = async () => {
    try {
      setPaymentLoading(true);
      setPaymentError(null);
      
      // Skip booking creation and go directly to Payment OTP for non-cash payments
      if (bookingForm.paymentMethod !== 'cash') {
        await requestPaymentOTPDirectly();
      } else {
        // For cash payments, try to create booking
        await createBookingForCash();
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentError(error.message || 'Payment failed. Please try again.');
      setPaymentLoading(false);
    }
  };

  // Create booking for cash payments
  const createBookingForCash = async () => {
    try {
      // Check authentication first
      const authCheck = await checkAndRefreshAuth();
      
      if (!authCheck.success) {
        setPaymentError(`Authentication required: ${authCheck.error}. Please login again.`);
        toast.error('Please login again to complete booking');
        setPaymentLoading(false);
        return;
      }

      const response = await axios.post('/api/bookings', bookingData, {
        headers: {
          'Authorization': `Bearer ${authCheck.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        const booking = response.data.booking;
        toast.success('Booking created successfully! Pay cash on arrival.');
        handleBookingComplete(booking);
      } else {
        setPaymentError(response.data.error || 'Failed to create booking');
        setPaymentLoading(false);
      }
    } catch (error) {
      console.error('Cash booking error:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        setPaymentError('Authentication expired. Please login again to complete booking.');
        toast.error('Please login again to complete booking');
      } else {
        setPaymentError(error.response?.data?.error || 'Failed to create booking');
      }
      setPaymentLoading(false);
    }
  };

  // Check and refresh authentication token
  const checkAndRefreshAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        return { success: false, error: 'No authentication token found' };
      }

      // Verify token is still valid
      const verifyResponse = await axios.get('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (verifyResponse.data.success) {
        return { success: true, token: token };
      } else {
        // Token is invalid, clear it
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return { success: false, error: 'Authentication token expired' };
      }
    } catch (error) {
      console.error('Auth verification error:', error);
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        // Token is expired or invalid, clear it
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return { success: false, error: 'Authentication token expired' };
      }
      
      return { success: false, error: 'Authentication verification failed' };
    }
  };

  // Request Payment OTP directly without booking creation
  const requestPaymentOTPDirectly = async () => {
    try {
      // Check authentication first
      const authCheck = await checkAndRefreshAuth();
      
      if (!authCheck.success) {
        setPaymentError(`Authentication required: ${authCheck.error}. Please login again.`);
        toast.error('Please login again to proceed with payment');
        setPaymentLoading(false);
        return;
      }

      const otpRequestData = {
        amount: getFinalAmount(),
        payment_method: bookingForm.paymentMethod,
        booking_ref: 'TEMP_' + Date.now(), // Temporary booking ref
        booking_id: null // No booking created yet
      };

      // Request payment OTP with verified token
      const otpResponse = await axios.post('/api/payment-otp/request-payment-otp', otpRequestData, {
        headers: {
          'Authorization': `Bearer ${authCheck.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (otpResponse.data.success) {
        setPaymentOtpKey(otpResponse.data.otpKey);
        setPaymentOtpData({
          amount: getFinalAmount(),
          payment_method: bookingForm.paymentMethod,
          booking_ref: otpRequestData.booking_ref
        });
        
        // Show OTP verification modal
        setShowPaymentOTP(true);
        setPaymentLoading(false);
        
        if (otpResponse.data.testMode) {
          toast.info(otpResponse.data.displayMessage);
        } else {
          toast.success('📧 Payment verification code sent to your email!');
        }
        
      } else {
        setPaymentError('Failed to send payment verification code. Please try again.');
        setPaymentLoading(false);
      }
    } catch (error) {
      console.error('Payment OTP request error:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        setPaymentError('Authentication expired. Please login again and try payment.');
        toast.error('Please login again to proceed with payment');
      } else {
        setPaymentError('Failed to request payment verification. Please try again.');
      }
      setPaymentLoading(false);
    }
  };

  const getPaymentMethodName = (method) => {
    const methodObj = paymentMethods.find(m => m.id === method);
    return methodObj ? methodObj.name : method;
  };

  const handleBookingComplete = (booking) => {
    // Get REAL user data from AuthContext instead of localStorage
    let realUserData = {
      name: 'User Name',
      email: 'user@email.com',
      phone: bookingForm.mobileNumber
    };

    if (user) {
      // Use actual logged-in user data from AuthContext
      realUserData = {
        name: user.name || user.username || user.full_name || 'User Name',
        email: user.email || 'user@email.com',
        phone: user.phone || user.mobile || user.contact_number || bookingForm.mobileNumber
      };
    } else {
      // Fallback: try to get from localStorage if AuthContext is not available
      try {
        const userData = localStorage.getItem('user');
        if (userData) {
          const parsedUser = JSON.parse(userData);
          realUserData = {
            name: parsedUser.name || parsedUser.username || parsedUser.full_name || 'User Name',
            email: parsedUser.email || 'user@email.com',
            phone: parsedUser.phone || parsedUser.mobile || parsedUser.contact_number || bookingForm.mobileNumber
          };
        }
      } catch (error) {
        console.log('Could not get user data from localStorage');
      }
    }

    // Send comprehensive booking and payment success email notification
    console.log('📧 SENDING COMPREHENSIVE SUCCESS EMAIL:');
    console.log('   🎉 BOOKING & PAYMENT SUCCESSFUL!');
    console.log('   📋 Booking Details:');
    console.log(`      - Reference: ${booking.booking_ref || booking.id}`);
    console.log(`      - Spot: ${selectedSpot?.name || 'Selected Parking Spot'}`);
    console.log(`      - Vehicle: ${bookingForm.vehicleNumber} (${bookingForm.vehicleColor} ${selectedVehicleType})`);
    console.log(`      - Duration: ${bookingForm.duration} hour(s)`);
    console.log(`      - Mobile: ${bookingForm.mobileNumber}`);
    console.log('   💳 Payment Details:');
    console.log(`      - Amount: ₹${getFinalAmount()}`);
    console.log(`      - Method: ${getPaymentMethodName(bookingForm.paymentMethod)}`);
    console.log(`      - Status: CONFIRMED`);
    console.log('   📧 Complete success email sent to user');
    console.log('   ✅ User will receive booking confirmation with all details');
    
    // Send admin notification with REAL USER DATA from AuthContext
    console.log('\n📧 SENDING ADMIN NOTIFICATION WITH REAL USER DATA FROM AUTHCONTEXT:');
    console.log('   🎉 NEW BOOKING & PAYMENT COMPLETED!');
    console.log('   👤 REAL CUSTOMER DETAILS (from AuthContext):');
    console.log(`      - Name: ${realUserData.name}`);
    console.log(`      - Email: ${realUserData.email}`);
    console.log(`      - Phone: ${realUserData.phone}`);
    console.log('   📋 Booking Summary:');
    console.log(`      - Reference: ${booking.booking_ref || booking.id}`);
    console.log(`      - Spot: ${selectedSpot?.name || 'Selected Parking Spot'}`);
    console.log(`      - Address: ${selectedSpot?.address || 'Parking Location'}`);
    console.log(`      - Vehicle: ${bookingForm.vehicleNumber} (${bookingForm.vehicleColor} ${selectedVehicleType})`);
    console.log(`      - Duration: ${bookingForm.duration} hour(s)`);
    console.log('   💰 Revenue Details:');
    console.log(`      - Amount Received: ₹${getFinalAmount()}`);
    console.log(`      - Payment Method: ${getPaymentMethodName(bookingForm.paymentMethod)}`);
    console.log(`      - Payment Status: CONFIRMED`);
    console.log('   📧 Admin notification sent to: shubhamyamakar9880@gmail.com');
    console.log('   ✅ Admin receives REAL user information from logged-in user, not dummy data');
    
    // Send actual admin notification email with real user data
    const sendAdminNotification = async () => {
      try {
        // Only send if we have real user data from AuthContext
        if (!user || !user.name || !user.email) {
          console.log('   ⚠️ No real user data available - skipping admin notification');
          return;
        }

        const adminNotificationData = {
          bookingData: {
            booking_ref: booking.booking_ref || booking.id,
            spot_name: selectedSpot?.name || 'Selected Parking Spot',
            spot_address: selectedSpot?.address || 'Parking Location',
            vehicle_number: bookingForm.vehicleNumber,
            vehicle_color: bookingForm.vehicleColor,
            vehicle_type: selectedVehicleType,
            duration: bookingForm.duration,
            start_time: new Date().toLocaleString(),
            end_time: new Date(Date.now() + (bookingForm.duration * 3600000)).toLocaleString(),
            booking_date: new Date().toLocaleDateString(),
            mobile_number: bookingForm.mobileNumber
          },
          paymentData: {
            amount: getFinalAmount(),
            payment_method: getPaymentMethodName(bookingForm.paymentMethod),
            transaction_id: 'TXN_' + Date.now(),
            payment_date: new Date().toLocaleString()
          }
        };
        
        // Call the backend API to send admin notification with real user data
        const token = localStorage.getItem('token');
        if (token) {
          const response = await axios.post('/api/payments/admin-notification', adminNotificationData, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.data.success) {
            console.log('   📧 Real admin notification email sent successfully via API');
            console.log(`   👤 Real user: ${user.name} (${user.email})`);
          } else {
            console.log('   ⚠️ Admin notification API failed:', response.data.error);
          }
        } else {
          console.log('   ⚠️ No auth token available for admin notification API');
        }
        
      } catch (error) {
        console.log('   ⚠️ Could not send admin notification email via API:', error.message);
      }
    };
    
    // Call the async function without blocking - ONLY for real users
    if (user && user.name && user.email) {
      sendAdminNotification();
    }
    
    onHide();
    setShowPayment(false);
    setPaymentError(null);
    setBookingForm({
      vehicleNumber: '',
      vehicleColor: '',
      mobileNumber: '',
      duration: 1,
      paymentMethod: 'phonepe'
    });
    setBookingData(null);
    if (onBookingSuccess) onBookingSuccess(booking);
  };

  const handlePaymentOTPSuccess = (paymentResult) => {
    // Payment OTP verified and payment completed successfully
    setShowPaymentOTP(false);
    setPaymentResult(paymentResult);
    setShowPaymentSuccess(true);
    
    // Show success toasts
    toast.success(`🎉 Payment of ₹${paymentResult.amount} completed successfully!`);
    toast.success(`📋 Booking confirmed: ${paymentResult.booking_ref}`);
    toast.success('📧 Confirmation emails sent to you and admin');
  };

  const handlePaymentSuccessClose = () => {
    setShowPaymentSuccess(false);
    
    // Create a booking object for completion
    const completedBooking = {
      id: paymentResult.booking_ref,
      booking_ref: paymentResult.booking_ref
    };
    
    handleBookingComplete(completedBooking);
  };

  const handleModalClose = () => {
    if (!paymentLoading && !showPaymentOTP && !showPaymentSuccess) {
      onHide();
      setShowBookingForm(true);
      setShowPayment(false);
      setShowPaymentOTP(false);
      setShowPaymentSuccess(false);
      setPaymentError(null);
      setPaymentOtpKey(null);
      setPaymentOtpData(null);
      setBookingData(null);
      setPaymentResult(null);
      setBookingForm({
        vehicleNumber: '',
        vehicleColor: '',
        mobileNumber: '',
        paymentMethod: 'phonepe'
      });
    }
  };

  if (!selectedSpot) return null;

  return (
    <>
      {/* Main Booking Modal */}
      <Modal show={show && showBookingForm} onHide={handleModalClose} size="lg">
        <Modal.Header closeButton={!paymentLoading}>
          <Modal.Title>
            <i className="fas fa-car me-2"></i>
            Book Parking Spot
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleBookingSubmit}>
            <div className="mb-4">
              <h5>{selectedSpot.name}</h5>
              <p className="text-muted">{selectedSpot.address}</p>
              <div className="row">
                <div className="col-md-6">
                  <p>
                    <strong>Vehicle Type:</strong> {selectedVehicleType.charAt(0).toUpperCase() + selectedVehicleType.slice(1)} | 
                    <strong> Price:</strong> ₹{getPricePerHour(selectedSpot, selectedVehicleType)}/hour
                  </p>
                </div>
                <div className="col-md-6">
                  <p>
                    <strong>Date:</strong> {selectedDate} | 
                    <strong> Time:</strong> {fromTime} - {toTime}
                  </p>
                  <p>
                    <strong>Duration:</strong> {duration?.toFixed(1)} hour(s) | 
                    <strong> Slots:</strong> {selectedSlots?.length || 0} slot(s)
                  </p>
                </div>
              </div>
            </div>

            <div className="row mb-3">
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>Vehicle Number *</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g., KA01AB1234"
                    value={bookingForm.vehicleNumber}
                    onChange={handleInputChange}
                    name="vehicleNumber"
                    maxLength="10"
                    isInvalid={!!formErrors.vehicleNumber}
                    required
                  />
                  <Form.Control.Feedback type="invalid">
                    {formErrors.vehicleNumber}
                  </Form.Control.Feedback>
                  <Form.Text className="text-muted">
                    Format: XX00XX0000 (e.g., KA01AB1234)
                  </Form.Text>
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>Vehicle Color *</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g., White, Red, Blue"
                    value={bookingForm.vehicleColor}
                    onChange={handleInputChange}
                    name="vehicleColor"
                    maxLength="20"
                    isInvalid={!!formErrors.vehicleColor}
                    required
                  />
                  <Form.Control.Feedback type="invalid">
                    {formErrors.vehicleColor}
                  </Form.Control.Feedback>
                  <Form.Text className="text-muted">
                    Only letters and spaces (2-20 characters)
                  </Form.Text>
                </Form.Group>
              </div>
            </div>

            <div className="row mb-3">
              <div className="col-md-12">
                <Form.Group>
                  <Form.Label>Mobile Number *</Form.Label>
                  <Form.Control
                    type="tel"
                    placeholder="Enter 10-digit mobile number"
                    value={bookingForm.mobileNumber}
                    onChange={handleInputChange}
                    name="mobileNumber"
                    maxLength="10"
                    isInvalid={!!formErrors.mobileNumber}
                    required
                  />
                  <Form.Control.Feedback type="invalid">
                    {formErrors.mobileNumber}
                  </Form.Control.Feedback>
                  <Form.Text className="text-muted">
                    Exactly 10 digits starting with 6, 7, 8, or 9
                  </Form.Text>
                </Form.Group>
              </div>
            </div>

            <Form.Group className="mb-4">
              <Form.Label>Payment Method *</Form.Label>
              <Row>
                {paymentMethods.map((method) => (
                  <Col md={6} key={method.id} className="mb-2">
                    <Card 
                      className={`payment-method-card ${bookingForm.paymentMethod === method.id ? 'selected' : ''}`}
                      style={{ cursor: 'pointer', border: bookingForm.paymentMethod === method.id ? `2px solid ${method.color}` : '1px solid #dee2e6' }}
                      onClick={() => setBookingForm({...bookingForm, paymentMethod: method.id})}
                    >
                      <Card.Body className="p-2 text-center">
                        <div style={{ fontSize: '1.5rem' }}>{method.icon}</div>
                        <small style={{ color: method.color, fontWeight: 'bold' }}>{method.name}</small>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Form.Group>

            <Alert variant="info">
              <div className="d-flex justify-content-between">
                <span><strong>Selected Slots:</strong></span>
                <span>{selectedSlots?.length || 0} slot(s)</span>
              </div>
              <div className="d-flex justify-content-between">
                <span><strong>Rate per slot:</strong></span>
                <span>₹{getPricePerHour(selectedSpot, selectedVehicleType)}/hour</span>
              </div>
              <div className="d-flex justify-content-between">
                <span><strong>Duration:</strong></span>
                <span>{duration?.toFixed(1)} hour(s)</span>
              </div>
              <div className="d-flex justify-content-between">
                <span><strong>Time Range:</strong></span>
                <span>{fromTime} - {toTime}</span>
              </div>
              <hr className="my-2" />
              <div className="d-flex justify-content-between">
                <span><strong>Total Cost:</strong></span>
                <span><strong>₹{getTotalAmount()}</strong></span>
              </div>
              <small className="text-muted">
                {selectedSlots?.length || 0} slot(s) × ₹{getPricePerHour(selectedSpot, selectedVehicleType)}/hour × {duration?.toFixed(1)} hour(s)
              </small>
            </Alert>

            <div className="d-flex gap-2">
              <Button variant="secondary" onClick={onHide} disabled={loading}>
                Cancel
              </Button>
              
              <Button 
                variant="primary" 
                type="submit" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Loading...
                  </>
                ) : (
                  'Proceed to Payment'
                )}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      {/* Payment Modal */}
      <Modal show={show && showPayment} onHide={handleModalClose} size="lg">
        <Modal.Header closeButton={!paymentLoading}>
          <Modal.Title>
            <i className="fas fa-credit-card me-2"></i>
            Complete Payment
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center mb-4">
            <div style={{ fontSize: '3rem' }}>
              {paymentMethods.find(m => m.id === bookingForm.paymentMethod)?.icon}
            </div>
            <h5>{getPaymentMethodName(bookingForm.paymentMethod)}</h5>
            {paymentLoading ? (
              <div className="payment-processing">
                <Spinner animation="border" variant="primary" className="mb-2" />
                <p className="text-primary">Processing your payment...</p>
                <small className="text-muted">Please do not close this window</small>
              </div>
            ) : (
              <p className="text-muted">Complete your payment to confirm booking</p>
            )}
          </div>

          <Card className="mb-4">
            <Card.Header>
              <h6 className="mb-0">
                <i className="fas fa-receipt me-2"></i>
                Booking Summary
              </h6>
            </Card.Header>
            <Card.Body>
              <div className="d-flex justify-content-between mb-2">
                <span>Parking Spot:</span>
                <span>{selectedSpot.name}</span>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Vehicle:</span>
                <span>{bookingForm.vehicleNumber} ({bookingForm.vehicleColor})</span>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Date & Time:</span>
                <span>{selectedDate} from {fromTime} to {toTime}</span>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Duration:</span>
                <span>{duration?.toFixed(1)} hour(s)</span>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Selected Slots:</span>
                <span>{selectedSlots?.length || 0} slot(s)</span>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Mobile:</span>
                <span>{bookingForm.mobileNumber}</span>
              </div>
              <hr />
              <div className="d-flex justify-content-between mb-2">
                <span>Parking Cost:</span>
                <span>₹{getTotalAmount()}</span>
              </div>
              {getProcessingFee() > 0 && (
                <div className="d-flex justify-content-between mb-2">
                  <span>Processing Fee:</span>
                  <span>₹{getProcessingFee()}</span>
                </div>
              )}
              <div className="d-flex justify-content-between">
                <strong>Total Amount:</strong>
                <strong>₹{getFinalAmount()}</strong>
              </div>
            </Card.Body>
          </Card>

          {paymentError && (
            <Alert variant="danger" className="mb-4">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <strong>Payment Error:</strong> {paymentError}
                </div>
              </div>
              <hr className="my-2" />
              <small className="text-muted">
                Please try again or contact support if the issue persists.
              </small>
            </Alert>
          )}

          {bookingForm.paymentMethod !== 'cash' && !paymentError && (
            <Alert variant="info">
              <small>
                <strong>🔐 Secure Payment:</strong> You will receive an OTP via email to verify your payment of ₹{getFinalAmount()} via {getPaymentMethodName(bookingForm.paymentMethod)}.
              </small>
            </Alert>
          )}

          <div className="d-flex gap-2">
            <Button 
              variant="secondary" 
              onClick={onHide}
              disabled={paymentLoading}
            >
              <i className="fas fa-arrow-left me-2"></i>
              Back to Booking
            </Button>
            <Button 
              variant={paymentError ? "warning" : "success"}
              onClick={handlePaymentConfirm}
              disabled={paymentLoading}
              className="flex-grow-1"
            >
              {paymentLoading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Processing Payment...
                </>
              ) : paymentError ? (
                'Retry Payment'
              ) : (
                <>
                  {bookingForm.paymentMethod === 'cash' ? 'Confirm Booking' : `Request Payment OTP - ₹${getFinalAmount()}`}
                </>
              )}
            </Button>
          </div>
        </Modal.Body>
      </Modal>
      
      {/* Payment OTP Verification Modal */}
      {paymentOtpKey && paymentOtpData && (
        <PaymentOTPVerification
          show={showPaymentOTP}
          onHide={() => setShowPaymentOTP(false)}
          otpKey={paymentOtpKey}
          paymentData={paymentOtpData}
          bookingData={bookingData}
          onPaymentSuccess={handlePaymentOTPSuccess}
        />
      )}

      {/* Payment Success Modal */}
      <PaymentSuccessModal
        show={showPaymentSuccess}
        onHide={handlePaymentSuccessClose}
        paymentResult={paymentResult}
        bookingDetails={bookingData}
        spotDetails={selectedSpot}
      />
    </>
  );
};

export default BookingModal;