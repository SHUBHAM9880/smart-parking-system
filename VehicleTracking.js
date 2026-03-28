import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Alert } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import axios from 'axios';

const VehicleTracking = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');
  const [sensorData, setSensorData] = useState({
    temperature: '25.0',
    humidity: '45.0',
    lastUpdate: new Date().toLocaleTimeString()
  });

  useEffect(() => {
    if (bookingId) {
      fetchBookingDetails();
    } else {
      fetchLatestBooking();
    }

    // Update sensor data every 5 seconds
    const sensorInterval = setInterval(updateSensorData, 5000);
    
    return () => clearInterval(sensorInterval);
  }, [bookingId]);

  useEffect(() => {
    if (booking) {
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    }
  }, [booking]);

  const fetchBookingDetails = async () => {
    try {
      const response = await axios.get(`/api/bookings/${bookingId}`);
      setBooking(response.data);
    } catch (error) {
      console.error('Error fetching booking:', error);
      toast.error('Failed to load booking details');
    } finally {
      setLoading(false);
    }
  };

  const fetchLatestBooking = async () => {
    try {
      const response = await axios.get('/api/bookings');
      if (response.data.length > 0) {
        setBooking(response.data[0]); // Get latest booking
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to load booking details');
    } finally {
      setLoading(false);
    }
  };

  const updateTimer = () => {
    if (!booking) return;

    const endTime = new Date(booking.end_time);
    const now = new Date();
    const timeDiff = endTime - now;

    if (timeDiff <= 0) {
      setTimeLeft('EXPIRED');
      return;
    }

    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

    setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
  };

  const updateSensorData = () => {
    setSensorData({
      temperature: (Math.random() * 10 + 20).toFixed(1),
      humidity: (Math.random() * 20 + 40).toFixed(1),
      lastUpdate: new Date().toLocaleTimeString()
    });
  };

  const simulateEntry = () => {
    toast.info('🚪 Gate Opening... Vehicle detected at entry point');
    setTimeout(() => {
      toast.success('✅ Entry Successful! Welcome to the parking facility');
    }, 2000);
  };

  const simulateExit = () => {
    if (!booking) {
      toast.error('❌ No active booking found for exit');
      return;
    }

    toast.info('🔍 Verifying vehicle and calculating charges...');
    setTimeout(() => {
      const totalCharges = calculateFinalBill();
      toast.success(`💳 Exit Approved! Total charges: ₹${totalCharges}`);
    }, 3000);
  };

  const calculateFinalBill = () => {
    if (!booking) return 0;

    const bookingTime = new Date(booking.booking_time);
    const now = new Date();
    const actualDuration = Math.ceil((now - bookingTime) / (1000 * 60 * 60));
    
    const baseAmount = parseFloat(booking.total_price);
    const extraHours = Math.max(0, actualDuration - booking.duration);
    const extraCharges = extraHours * (baseAmount / booking.duration);
    const tax = (baseAmount + extraCharges) * 0.18;
    
    return (baseAmount + extraCharges + tax).toFixed(2);
  };

  const trackVehicleLocation = () => {
    toast.info('📍 Tracking vehicle location...');
    setTimeout(() => {
      const location = booking ? booking.spot_name : 'Unknown Location';
      toast.success(`🎯 Vehicle located at: ${location}, Slot B-23`);
    }, 2000);
  };

  if (loading) {
    return (
      <Container className="py-5">
        <div className="text-center">
          <div className="spinner-border text-primary" />
          <p className="mt-3">Loading tracking information...</p>
        </div>
      </Container>
    );
  }

  if (!booking) {
    return (
      <Container className="py-5">
        <Alert variant="info" className="text-center">
          <h4>No Active Booking Found</h4>
          <p>You don't have any active parking sessions.</p>
          <Button variant="primary" onClick={() => navigate('/parking-map')}>
            Find Parking Spot
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4 fade-in">
      <Row className="mb-4">
        <Col>
          <h2>
            <i className="fas fa-search-location me-2"></i>
            Vehicle Tracking & Management
          </h2>
          <p className="text-muted">Real-time vehicle location and parking management</p>
        </Col>
      </Row>

      {/* Current Booking Status */}
      <Row className="mb-4">
        <Col>
          <Card className="dashboard-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <Card.Body>
              <Row className="align-items-center">
                <Col md={8}>
                  <h4>
                    <i className="fas fa-parking me-2"></i>
                    Current Parking Status
                  </h4>
                  <div>
                    <p><strong>Booking ID:</strong> {booking.id}</p>
                    <p><strong>Location:</strong> {booking.spot_name}</p>
                    <p><strong>Vehicle:</strong> {booking.vehicle_number} ({booking.vehicle_color})</p>
                    <p><strong>Duration:</strong> {booking.duration} hour(s)</p>
                    <p><strong>End Time:</strong> {new Date(booking.end_time).toLocaleString()}</p>
                  </div>
                </Col>
                <Col md={4} className="text-center">
                  <div className="h2 mb-2">{timeLeft}</div>
                  <span className={`status-badge ${timeLeft === 'EXPIRED' ? 'status-expired' : 'status-parked'}`}>
                    {timeLeft === 'EXPIRED' ? '⏰ EXPIRED' : '🅿️ PARKED'}
                  </span>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Vehicle Information and Sensor Data */}
      <Row className="mb-4">
        <Col md={6}>
          <Card className="dashboard-card">
            <Card.Body>
              <h5>
                <i className="fas fa-car me-2"></i>
                Vehicle Information
              </h5>
              <Row>
                <Col>
                  <p><strong>Registration:</strong> {booking.vehicle_number}</p>
                  <p><strong>Color:</strong> {booking.vehicle_color}</p>
                  <p><strong>Owner:</strong> Verified ✅</p>
                </Col>
                <Col>
                  <p><strong>License Status:</strong> Valid ✅</p>
                  <p><strong>Insurance:</strong> Active ✅</p>
                  <p><strong>Challans:</strong> None 🟢</p>
                </Col>
              </Row>
              <div className="mt-3">
                <Button variant="info" size="sm" className="me-2" onClick={trackVehicleLocation}>
                  <i className="fas fa-map-marker-alt me-1"></i>
                  Track Location
                </Button>
                <Button variant="warning" size="sm" onClick={() => toast.info('Issue reporting feature coming soon!')}>
                  <i className="fas fa-exclamation-triangle me-1"></i>
                  Report Issue
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="dashboard-card" style={{ background: '#e3f2fd', borderLeft: '4px solid #2196f3' }}>
            <Card.Body>
              <h5>
                <i className="fas fa-satellite-dish me-2"></i>
                Real-time Sensor Data
              </h5>
              <Row>
                <Col>
                  <p><strong>🌡️ Temperature:</strong> {sensorData.temperature}°C</p>
                  <p><strong>💧 Humidity:</strong> {sensorData.humidity}%</p>
                </Col>
                <Col>
                  <p><strong>🚗 Spot Status:</strong> Occupied</p>
                  <p><strong>🕐 Last Update:</strong> {sensorData.lastUpdate}</p>
                </Col>
              </Row>
              <div className="progress mt-2">
                <div 
                  className="progress-bar bg-success" 
                  style={{ width: `${100 - parseFloat(sensorData.humidity)}%` }}
                >
                  Signal Strength: {(100 - parseFloat(sensorData.humidity)).toFixed(0)}%
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Gate Control */}
      <Row className="mb-4">
        <Col md={6}>
          <Card className="dashboard-card" style={{ background: '#fff3cd', border: '1px solid #ffeaa7' }}>
            <Card.Body className="text-center">
              <h5>
                <i className="fas fa-door-open me-2"></i>
                Smart Gate Control
              </h5>
              <p>Automated entry/exit system</p>
              <Button variant="success" className="me-2" onClick={simulateEntry}>
                <i className="fas fa-sign-in-alt me-1"></i>
                Simulate Entry
              </Button>
              <Button variant="warning" onClick={simulateExit}>
                <i className="fas fa-sign-out-alt me-1"></i>
                Simulate Exit
              </Button>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="dashboard-card" style={{ background: '#fff3cd', border: '1px solid #ffeaa7' }}>
            <Card.Body className="text-center">
              <h5>
                <i className="fas fa-shield-alt me-2"></i>
                Vehicle Verification
              </h5>
              <div>
                <p className="mb-1">✅ License Valid</p>
                <p className="mb-1">✅ No Pending Challans</p>
                <p className="mb-1">✅ Owner Verified</p>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Billing Information */}
      <Row className="mb-4">
        <Col>
          <Card className="dashboard-card">
            <Card.Body>
              <h5>
                <i className="fas fa-receipt me-2"></i>
                Billing Information
              </h5>
              <Row>
                <Col md={6}>
                  <p><strong>Base Amount:</strong> ₹{booking.total_price}</p>
                  <p><strong>Duration:</strong> {booking.duration} hour(s)</p>
                  <p><strong>Rate:</strong> ₹{(parseFloat(booking.total_price) / booking.duration).toFixed(2)}/hour</p>
                </Col>
                <Col md={6}>
                  <p><strong>Tax (18%):</strong> ₹{(parseFloat(booking.total_price) * 0.18).toFixed(2)}</p>
                  <p><strong>Total Amount:</strong> ₹{(parseFloat(booking.total_price) * 1.18).toFixed(2)}</p>
                  <p><strong>Status:</strong> <span className="badge bg-success">Paid</span></p>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default VehicleTracking;