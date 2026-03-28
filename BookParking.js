import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Badge, Form, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import BookingModal from '../../components/BookingModal/BookingModal';
import ParkingSlotGrid from '../../components/ParkingSlotGrid/ParkingSlotGrid';
import LocationPermissionFlow from '../../components/LocationPermissionFlow/LocationPermissionFlow';
import axios from 'axios';
import io from 'socket.io-client';
import './BookParking.css';

const BookParking = () => {
  const [parkingSpots, setParkingSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicleType, setSelectedVehicleType] = useState('car');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [fromTime, setFromTime] = useState('09:00');
  const [toTime, setToTime] = useState('11:00');
  const [duration, setDuration] = useState(2);
  const [canExtend, setCanExtend] = useState(false);
  const [extendHours, setExtendHours] = useState(1);
  
  // Step management for 3-page wizard
  const [currentStep, setCurrentStep] = useState(1); // 1: Parking Spots, 2: Vehicle & Time, 3: Slot Selection
  
  // Location permission flow (removed - direct booking enabled)
  const [showLocationPermissionFlow, setShowLocationPermissionFlow] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  
  // Real-time socket connection
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    fetchParkingSpots();
    fetchUserInfo();
    setupRealTimeUpdates();
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // Fetch user information
  const fetchUserInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const response = await axios.get('/api/auth/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setUserInfo(response.data.user);
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  };

  // Setup real-time socket connection for slot updates
  const setupRealTimeUpdates = () => {
    const newSocket = io('http://localhost:5000');
    
    newSocket.on('connect', () => {
      console.log('🔄 Connected to real-time slot updates');
    });
    
    // Listen for real-time slot availability updates
    newSocket.on('slot-availability-update', (updateData) => {
      console.log('🔄 Received slot availability update:', updateData);
      
      // Update the parking spots state with new availability data
      setParkingSpots(prevSpots => 
        prevSpots.map(spot => {
          if (spot.id === updateData.spotId) {
            return {
              ...spot,
              available_spots: updateData.availabilityData.available_spots,
              total_spots: updateData.availabilityData.total_spots,
              available_car_spots: updateData.availabilityData.available_car_spots,
              car_spots: updateData.availabilityData.car_spots,
              available_bike_spots: updateData.availabilityData.available_bike_spots,
              bike_spots: updateData.availabilityData.bike_spots,
              available_truck_spots: updateData.availabilityData.available_truck_spots,
              truck_spots: updateData.availabilityData.truck_spots
            };
          }
          return spot;
        })
      );
      
      // Show toast notification about slot availability
      toast.success(
        `🅿️ Slot Available! ${updateData.message}`, 
        {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        }
      );
    });
    
    newSocket.on('disconnect', () => {
      console.log('🔄 Disconnected from real-time slot updates');
    });
    
    setSocket(newSocket);
  };

  // Calculate duration when times change
  useEffect(() => {
    if (fromTime && toTime) {
      const from = new Date(`2000-01-01T${fromTime}`);
      const to = new Date(`2000-01-01T${toTime}`);
      
      if (to > from) {
        const diffMs = to - from;
        const diffHours = diffMs / (1000 * 60 * 60);
        setDuration(diffHours);
        setCanExtend(diffHours > 0);
      } else {
        setDuration(0);
        setCanExtend(false);
      }
    }
  }, [fromTime, toTime]);

  const fetchParkingSpots = async () => {
    try {
      const response = await axios.get('/api/parking-spots');
      if (response.data.success) {
        setParkingSpots(response.data.spots);
      } else {
        toast.error('Failed to load parking spots');
      }
    } catch (error) {
      console.error('Error fetching parking spots:', error);
      toast.error('Failed to load parking spots');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableSpots = (spot, vehicleType) => {
    switch (vehicleType) {
      case 'car':
        return spot.available_car_spots || 0;
      case 'bike':
        return spot.available_bike_spots || 0;
      case 'truck':
        return spot.available_truck_spots || 0;
      default:
        return spot.available_spots || 0;
    }
  };

  const getTotalSpots = (spot, vehicleType) => {
    switch (vehicleType) {
      case 'car':
        return spot.car_spots || 0;
      case 'bike':
        return spot.bike_spots || 0;
      case 'truck':
        return spot.truck_spots || 0;
      default:
        return spot.total_spots || 0;
    }
  };

  const getPricePerHour = (spot, vehicleType) => {
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

  const handleSelectSpot = async (spot) => {
    const availableSpots = getAvailableSpots(spot, selectedVehicleType);
    if (availableSpots <= 0) {
      toast.error(`No ${selectedVehicleType} spots available at this location`);
      return;
    }
    
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Please login first to book parking');
      return;
    }

    // Directly proceed to booking without location permission check
    setSelectedSpot(spot);
    setCurrentStep(2); // Go to Vehicle & Time selection page
    toast.success(`Selected ${spot.name} for booking`);
  };

  const handleLocationPermissionGranted = (locationData) => {
    // Location permission functionality removed - this function is no longer needed
    console.log('Location permission functionality has been removed');
    setShowLocationPermissionFlow(false);
    setCurrentStep(2);
  };

  const handleVehicleTimeNext = () => {
    if (duration <= 0) {
      toast.error('Please select valid from and to times');
      return;
    }
    
    setCurrentStep(3); // Go to Slot selection page
  };

  const handleBackToSpots = () => {
    setCurrentStep(1); // Go back to parking spots
    setSelectedSpot(null);
    setSelectedSlots([]);
  };

  const handleBackToVehicleTime = () => {
    setCurrentStep(2); // Go back to vehicle & time selection
    setSelectedSlots([]);
  };

  const handleSlotSelection = (slots) => {
    setSelectedSlots(slots);
    if (slots.length > 0) {
      toast.success(`Selected ${slots.length} slot(s): ${slots.map(s => s.slot_number).join(', ')}`);
    }
  };

  const handleProceedToBooking = () => {
    if (selectedSlots.length === 0) {
      toast.error('Please select at least one parking slot');
      return;
    }
    
    if (duration <= 0) {
      toast.error('Please select valid from and to times');
      return;
    }
    
    // Proceed directly to payment without availability checking
    setShowBookingModal(true);
  };

  const handleExtendTime = () => {
    if (extendHours <= 0) {
      toast.error('Please enter valid extension hours');
      return;
    }

    const currentTo = new Date(`2000-01-01T${toTime}`);
    const newTo = new Date(currentTo.getTime() + (extendHours * 60 * 60 * 1000));
    const newToTime = newTo.toTimeString().slice(0, 5);
    
    setToTime(newToTime);
    toast.success(`Extended booking by ${extendHours} hour(s). New end time: ${newToTime}`);
  };

  const getTotalAmount = () => {
    if (!selectedSpot || selectedSlots.length === 0) return 0;
    const pricePerHour = getPricePerHour(selectedSpot, selectedVehicleType);
    return selectedSlots.length * pricePerHour * duration;
  };

  const getAvailabilityBadge = (spot, vehicleType) => {
    const available = getAvailableSpots(spot, vehicleType);
    const total = getTotalSpots(spot, vehicleType);
    
    if (total === 0) {
      return <Badge bg="secondary">Not Available</Badge>;
    }
    
    if (available === 0) {
      return <Badge bg="danger">Full</Badge>;
    } else if (available <= total * 0.2) {
      return <Badge bg="warning">Almost Full</Badge>;
    } else {
      return <Badge bg="success">Available</Badge>;
    }
  };

  if (loading) {
    return (
      <Container className="py-5">
        <div className="text-center">
          <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} />
          <p className="mt-3">Loading parking spots...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      {/* Step Progress Indicator */}
      <Row className="mb-4">
        <Col>
          <div className="d-flex justify-content-center">
            <div className="d-flex align-items-center gap-3">
              <div className={`step-indicator ${currentStep >= 1 ? 'active' : ''}`}>
                <span className="step-number">1</span>
                <span className="step-label">Select Parking</span>
              </div>
              <div className="step-connector"></div>
              <div className={`step-indicator ${currentStep >= 2 ? 'active' : ''}`}>
                <span className="step-number">2</span>
                <span className="step-label">Vehicle & Time</span>
              </div>
              <div className="step-connector"></div>
              <div className={`step-indicator ${currentStep >= 3 ? 'active' : ''}`}>
                <span className="step-number">3</span>
                <span className="step-label">Select Slots</span>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {/* PAGE 1: PARKING SPOTS SELECTION */}
      {currentStep === 1 && (
        <>
          <Row className="mb-4">
            <Col>
              <h2>
                <i className="fas fa-parking me-2"></i>
                Select Parking Location
              </h2>
              <p className="text-muted">Choose your preferred parking location</p>
            </Col>
          </Row>

          {/* Parking Spots */}
          <Row>
            {parkingSpots.length === 0 ? (
              <Col>
                <Alert variant="info">
                  <i className="fas fa-info-circle me-2"></i>
                  No parking spots found. Please try again later.
                </Alert>
              </Col>
            ) : (
              parkingSpots.map((spot) => {
                return (
                  <Col lg={6} md={8} className="mb-4 mx-auto" key={spot.id}>
                    <Card className="h-100 parking-spot-card">
                      <Card.Body>
                        <div className="d-flex justify-content-between align-items-start mb-3">
                          <Card.Title className="h4">{spot.name}</Card.Title>
                          <Badge bg="success">Available</Badge>
                        </div>
                        
                        <Card.Text className="text-muted mb-3">
                          <i className="fas fa-map-marker-alt me-2"></i>
                          {spot.address}
                        </Card.Text>

                        <div className="mb-3">
                          <Row>
                            <Col md={4}>
                              <div className="text-center p-2 border rounded">
                                <i className="fas fa-car text-primary mb-1" style={{fontSize: '1.5rem'}}></i>
                                <div className="fw-bold">{spot.car_spots}</div>
                                <small className="text-muted">Car Spots</small>
                                <div className="text-primary fw-bold">₹{spot.car_price_per_hour}/hr</div>
                              </div>
                            </Col>
                            <Col md={4}>
                              <div className="text-center p-2 border rounded">
                                <i className="fas fa-motorcycle text-success mb-1" style={{fontSize: '1.5rem'}}></i>
                                <div className="fw-bold">{spot.bike_spots}</div>
                                <small className="text-muted">Bike Spots</small>
                                <div className="text-success fw-bold">₹{spot.bike_price_per_hour}/hr</div>
                              </div>
                            </Col>
                            <Col md={4}>
                              <div className="text-center p-2 border rounded">
                                <i className="fas fa-truck text-warning mb-1" style={{fontSize: '1.5rem'}}></i>
                                <div className="fw-bold">{spot.truck_spots}</div>
                                <small className="text-muted">Truck Spots</small>
                                <div className="text-warning fw-bold">₹{spot.truck_price_per_hour}/hr</div>
                              </div>
                            </Col>
                          </Row>
                        </div>

                        <div className="mb-3">
                          <div className="d-flex justify-content-between">
                            <span>Rating:</span>
                            <span>
                              {[...Array(5)].map((_, i) => (
                                <i 
                                  key={i}
                                  className={`fas fa-star ${i < Math.floor(spot.rating) ? 'text-warning' : 'text-muted'}`}
                                ></i>
                              ))}
                              <span className="ms-1">({spot.rating})</span>
                            </span>
                          </div>
                        </div>

                        {spot.features && spot.features.length > 0 && (
                          <div className="mb-3">
                            <div className="d-flex flex-wrap gap-1">
                              {spot.features.slice(0, 3).map((feature, index) => (
                                <Badge key={index} bg="light" text="dark" className="small">
                                  {feature}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="d-grid">
                          <Button 
                            variant="primary"
                            size="lg"
                            onClick={() => handleSelectSpot(spot)}
                          >
                            <i className="fas fa-arrow-right me-2"></i>
                            Select This Location
                          </Button>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                );
              })
            )}
          </Row>
        </>
      )}

      {/* PAGE 2: VEHICLE TYPE & DATE/TIME SELECTION */}
      {currentStep === 2 && selectedSpot && (
        <>
          <Row className="mb-4">
            <Col>
              <div className="d-flex align-items-center gap-3">
                <Button variant="outline-secondary" onClick={handleBackToSpots}>
                  <i className="fas fa-arrow-left me-2"></i>
                  Back
                </Button>
                <div>
                  <h2 className="mb-0">
                    <i className="fas fa-cog me-2"></i>
                    Configure Your Booking
                  </h2>
                  <p className="text-muted mb-0">Selected: {selectedSpot.name}</p>
                </div>
              </div>
            </Col>
          </Row>

          {/* Vehicle Type Selection */}
          <Row className="mb-4">
            <Col>
              <Card>
                <Card.Body>
                  <h5 className="mb-3">
                    <i className="fas fa-car me-2"></i>
                    Select Vehicle Type
                  </h5>
                  <Form.Group>
                    <div className="d-flex gap-4 justify-content-center">
                      <Form.Check
                        type="radio"
                        id="car"
                        name="vehicleType"
                        label={
                          <div className="text-center p-3 border rounded" style={{minWidth: '120px'}}>
                            <i className="fas fa-car text-primary mb-2" style={{fontSize: '2rem'}}></i>
                            <div className="fw-bold">Car</div>
                            <small className="text-muted">{selectedSpot.car_spots} spots</small>
                            <div className="text-primary fw-bold">₹{selectedSpot.car_price_per_hour}/hr</div>
                          </div>
                        }
                        checked={selectedVehicleType === 'car'}
                        onChange={() => setSelectedVehicleType('car')}
                      />
                      <Form.Check
                        type="radio"
                        id="bike"
                        name="vehicleType"
                        label={
                          <div className="text-center p-3 border rounded" style={{minWidth: '120px'}}>
                            <i className="fas fa-motorcycle text-success mb-2" style={{fontSize: '2rem'}}></i>
                            <div className="fw-bold">Bike</div>
                            <small className="text-muted">{selectedSpot.bike_spots} spots</small>
                            <div className="text-success fw-bold">₹{selectedSpot.bike_price_per_hour}/hr</div>
                          </div>
                        }
                        checked={selectedVehicleType === 'bike'}
                        onChange={() => setSelectedVehicleType('bike')}
                      />
                      <Form.Check
                        type="radio"
                        id="truck"
                        name="vehicleType"
                        label={
                          <div className="text-center p-3 border rounded" style={{minWidth: '120px'}}>
                            <i className="fas fa-truck text-warning mb-2" style={{fontSize: '2rem'}}></i>
                            <div className="fw-bold">Truck</div>
                            <small className="text-muted">{selectedSpot.truck_spots} spots</small>
                            <div className="text-warning fw-bold">₹{selectedSpot.truck_price_per_hour}/hr</div>
                          </div>
                        }
                        checked={selectedVehicleType === 'truck'}
                        onChange={() => setSelectedVehicleType('truck')}
                      />
                    </div>
                  </Form.Group>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Date and Time Selection */}
          <Row className="mb-4">
            <Col md={8}>
              <Card>
                <Card.Body>
                  <h6 className="mb-3">
                    <i className="fas fa-calendar me-2"></i>
                    Select Date & Time Range
                  </h6>
                  <Row>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>Date</Form.Label>
                        <Form.Control
                          type="date"
                          value={selectedDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setSelectedDate(e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>From Time</Form.Label>
                        <Form.Control
                          type="time"
                          value={fromTime}
                          onChange={(e) => setFromTime(e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>To Time</Form.Label>
                        <Form.Control
                          type="time"
                          value={toTime}
                          onChange={(e) => setToTime(e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  
                  {/* Duration Display */}
                  {duration > 0 && (
                    <Alert variant="info" className="mb-3">
                      <Row className="align-items-center">
                        <Col md={6}>
                          <strong>Duration:</strong> {duration.toFixed(1)} hour(s)
                        </Col>
                        <Col md={6}>
                          <strong>Time Range:</strong> {fromTime} - {toTime}
                        </Col>
                      </Row>
                    </Alert>
                  )}
                  
                  {/* Extend Time Feature */}
                  {canExtend && (
                    <div className="border-top pt-3">
                      <h6 className="mb-2">
                        <i className="fas fa-clock me-2"></i>
                        Extend Booking Time
                      </h6>
                      <Row className="align-items-end">
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>Extend by (hours)</Form.Label>
                            <Form.Control
                              type="number"
                              min="0.5"
                              max="12"
                              step="0.5"
                              value={extendHours}
                              onChange={(e) => setExtendHours(parseFloat(e.target.value))}
                              placeholder="1"
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Button 
                            variant="outline-primary" 
                            onClick={handleExtendTime}
                            disabled={!extendHours || extendHours <= 0}
                          >
                            <i className="fas fa-plus me-2"></i>
                            Extend Time
                          </Button>
                        </Col>
                      </Row>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
            
            {/* Booking Summary */}
            <Col md={4}>
              <Card className="bg-light">
                <Card.Body>
                  <h6 className="mb-3">
                    <i className="fas fa-calculator me-2"></i>
                    Booking Summary
                  </h6>
                  
                  <div className="mb-2">
                    <small className="text-muted">Location:</small>
                    <div className="fw-bold">{selectedSpot.name}</div>
                  </div>
                  
                  <div className="mb-2">
                    <small className="text-muted">Vehicle Type:</small>
                    <div className="fw-bold">{selectedVehicleType.charAt(0).toUpperCase() + selectedVehicleType.slice(1)}</div>
                  </div>
                  
                  {duration > 0 && (
                    <>
                      <div className="mb-2">
                        <small className="text-muted">Duration:</small>
                        <div className="fw-bold">{duration.toFixed(1)} hour(s)</div>
                      </div>
                      
                      <div className="mb-2">
                        <small className="text-muted">Rate per slot:</small>
                        <div className="fw-bold">₹{getPricePerHour(selectedSpot, selectedVehicleType)}/hour</div>
                      </div>
                      
                      <hr className="my-2" />
                      
                      <div className="mb-0">
                        <small className="text-muted">Estimated Cost (per slot):</small>
                        <div className="h5 text-success mb-0">₹{(getPricePerHour(selectedSpot, selectedVehicleType) * duration).toFixed(2)}</div>
                      </div>
                    </>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Next Button */}
          <Row>
            <Col className="text-center">
              <Button 
                variant="primary" 
                size="lg"
                onClick={handleVehicleTimeNext}
                disabled={duration <= 0}
              >
                <i className="fas fa-arrow-right me-2"></i>
                Continue to Slot Selection
              </Button>
            </Col>
          </Row>
        </>
      )}

      {/* PAGE 3: SLOT SELECTION */}
      {currentStep === 3 && selectedSpot && (
        <>
          <Row className="mb-4">
            <Col>
              <div className="d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-3">
                  <Button variant="outline-secondary" onClick={handleBackToVehicleTime}>
                    <i className="fas fa-arrow-left me-2"></i>
                    Back
                  </Button>
                  <div>
                    <h2 className="mb-0">
                      <i className="fas fa-th me-2"></i>
                      Select Your Parking Slots
                    </h2>
                    <p className="text-muted mb-0">
                      {selectedSpot.name} - {selectedVehicleType.charAt(0).toUpperCase() + selectedVehicleType.slice(1)} Parking
                    </p>
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          {/* Visual Slot Selection Grid */}
          <ParkingSlotGrid
            selectedSpot={selectedSpot}
            selectedVehicleType={selectedVehicleType}
            selectedDate={selectedDate}
            fromTime={fromTime}
            toTime={toTime}
            duration={duration}
            onSlotSelect={handleSlotSelection}
          />

          {/* Proceed to Booking */}
          {selectedSlots.length > 0 && (
            <Row>
              <Col>
                <Card className="bg-success text-white">
                  <Card.Body>
                    <Row className="align-items-center">
                      <Col md={8}>
                        <h5 className="mb-1">
                          <i className="fas fa-check-circle me-2"></i>
                          {selectedSlots.length} Slot(s) Selected
                        </h5>
                        <p className="mb-0">
                          Slots: {selectedSlots.map(s => s.slot_number).join(', ')} | 
                          Total: ₹{getTotalAmount().toFixed(2)} for {duration.toFixed(1)} hour(s)
                        </p>
                      </Col>
                      <Col md={4} className="text-end">
                        <Button 
                          variant="light" 
                          size="lg"
                          onClick={handleProceedToBooking}
                        >
                          <i className="fas fa-credit-card me-2"></i>
                          Proceed to Payment
                        </Button>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          )}
        </>
      )}

      {/* Booking Modal */}
      <BookingModal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        selectedSpot={selectedSpot}
        selectedVehicleType={selectedVehicleType}
        selectedSlots={selectedSlots}
        selectedDate={selectedDate}
        fromTime={fromTime}
        toTime={toTime}
        duration={duration}
        onBookingSuccess={(booking) => {
          toast.success(`Booking created: ${booking.booking_ref}`);
          setShowBookingModal(false);
          setCurrentStep(1); // Reset to first step
          setSelectedSpot(null);
          setSelectedSlots([]);
          fetchParkingSpots(); // Refresh spots
        }}
      />

      {/* Location Permission Flow Modal - DISABLED */}
      {/* Location permission functionality has been removed for direct booking access */}
      {showLocationPermissionFlow && (
        <LocationPermissionFlow
          show={showLocationPermissionFlow}
          onHide={() => setShowLocationPermissionFlow(false)}
          onPermissionGranted={handleLocationPermissionGranted}
          selectedSpot={selectedSpot}
          userInfo={userInfo}
        />
      )}
    </Container>
  );
};

export default BookParking;