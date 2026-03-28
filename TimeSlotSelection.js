import { useState, useEffect } from 'react';
import { Modal, Card, Button, Row, Col, Badge, Alert, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import RealTimeSlotAvailability from '../RealTimeSlotAvailability/RealTimeSlotAvailability';
import ParkingSlotGrid from '../ParkingSlotGrid/ParkingSlotGrid';

const TimeSlotSelection = ({ 
  show, 
  onHide, 
  selectedSpot, 
  selectedVehicleType, 
  bookingForm,
  onTimeSlotConfirm,
  onBack
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(false);

  // Generate next 30 days for date selection (extended from 7 days)
  const generateDates = () => {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push({
        value: date.toISOString().split('T')[0],
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        }),
        fullDate: date.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      });
    }
    return dates;
  };

  // Get minimum date (today)
  const getMinDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Get maximum date (1 year from now)
  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    return maxDate.toISOString().split('T')[0];
  };

  // Generate time slots based on parking spot availability
  const generateTimeSlots = () => {
    const slots = [];
    const now = new Date();
    const isToday = selectedDate === now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    
    // Generate slots from 6 AM to 11 PM
    for (let hour = 6; hour <= 23; hour++) {
      // Skip past hours for today
      if (isToday && hour <= currentHour) continue;
      
      const timeSlot = {
        value: `${hour.toString().padStart(2, '0')}:00`,
        label: `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`,
        available: Math.random() > 0.3, // Simulate availability (70% chance)
        price: calculateSlotPrice(hour)
      };
      
      slots.push(timeSlot);
    }
    
    return slots;
  };

  // Calculate dynamic pricing based on time slot
  const calculateSlotPrice = (hour) => {
    const basePrice = getVehiclePrice();
    
    // Peak hours (8-10 AM, 6-8 PM) - 50% more
    if ((hour >= 8 && hour <= 10) || (hour >= 18 && hour <= 20)) {
      return Math.round(basePrice * 1.5);
    }
    
    // Off-peak hours (10 PM - 6 AM) - 25% less
    if (hour >= 22 || hour <= 6) {
      return Math.round(basePrice * 0.75);
    }
    
    // Regular hours
    return basePrice;
  };

  // Get vehicle-specific price
  const getVehiclePrice = () => {
    if (!selectedSpot) return 20;
    
    switch (selectedVehicleType) {
      case 'car':
        return selectedSpot.car_price_per_hour || 20;
      case 'bike':
        return selectedSpot.bike_price_per_hour || 10;
      case 'truck':
        return selectedSpot.truck_price_per_hour || 50;
      default:
        return 20;
    }
  };

  // Calculate duration in hours from start and end time
  const calculateDuration = () => {
    if (!startTime || !endTime) return bookingForm.duration;
    
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    
    if (end <= start) {
      // Handle next day scenario
      end.setDate(end.getDate() + 1);
    }
    
    const diffMs = end - start;
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.max(0.5, diffHours); // Minimum 30 minutes
  };

  // Calculate total amount based on custom time or predefined slots
  const calculateTotalAmount = () => {
    const basePrice = getVehiclePrice();
    const duration = useCustomTime ? calculateDuration() : bookingForm.duration;
    
    if (useCustomTime && startTime) {
      const hour = parseInt(startTime.split(':')[0]);
      const dynamicPrice = calculateSlotPrice(hour);
      return Math.round(dynamicPrice * duration);
    }
    
    return Math.round(basePrice * duration);
  };

  // Update available slots when date changes
  useEffect(() => {
    if (selectedDate) {
      setLoading(true);
      // Simulate API call delay
      setTimeout(() => {
        setAvailableSlots(generateTimeSlots());
        setLoading(false);
      }, 500);
    }
  }, [selectedDate, selectedVehicleType]);

  // Set default date to today
  useEffect(() => {
    if (show && !selectedDate) {
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(today);
    }
  }, [show]);

  const handleConfirm = () => {
    if (!selectedDate) {
      toast.error('Please select a date');
      return;
    }

    // Check if slots are selected
    if (selectedSlots.length === 0) {
      toast.error('Please select at least one parking slot');
      return;
    }

    if (useCustomTime) {
      // Custom time validation
      if (!startTime || !endTime) {
        toast.error('Please select both start and end time');
        return;
      }

      const start = new Date(`2000-01-01T${startTime}`);
      const end = new Date(`2000-01-01T${endTime}`);
      
      if (end <= start) {
        // Check if it's a reasonable next-day booking (max 12 hours)
        const nextDayEnd = new Date(end);
        nextDayEnd.setDate(nextDayEnd.getDate() + 1);
        const diffHours = (nextDayEnd - start) / (1000 * 60 * 60);
        
        if (diffHours > 24) {
          toast.error('End time must be after start time');
          return;
        }
      }

      const duration = calculateDuration();
      const totalAmount = calculateTotalAmount() * selectedSlots.length; // Multiply by number of slots

      const timeSlotData = {
        date: selectedDate,
        timeSlot: startTime,
        endTime: endTime,
        slotLabel: `${formatTime(startTime)} - ${formatTime(endTime)}`,
        price: Math.round(totalAmount / duration / selectedSlots.length),
        duration: duration,
        totalAmount: totalAmount,
        fullDate: getFullDateString(selectedDate),
        isCustomTime: true,
        selectedSlots: selectedSlots,
        slotCount: selectedSlots.length
      };

      onTimeSlotConfirm(timeSlotData);
    } else {
      // Predefined slot validation
      if (!selectedTimeSlot) {
        toast.error('Please select a time slot');
        return;
      }

      const selectedSlot = availableSlots.find(slot => slot.value === selectedTimeSlot);
      if (!selectedSlot || !selectedSlot.available) {
        toast.error('Selected time slot is not available');
        return;
      }

      const totalAmount = selectedSlot.price * bookingForm.duration * selectedSlots.length; // Multiply by number of slots

      const timeSlotData = {
        date: selectedDate,
        timeSlot: selectedTimeSlot,
        slotLabel: selectedSlot.label,
        price: selectedSlot.price,
        duration: bookingForm.duration,
        totalAmount: totalAmount,
        fullDate: getFullDateString(selectedDate),
        isCustomTime: false,
        selectedSlots: selectedSlots,
        slotCount: selectedSlots.length
      };

      onTimeSlotConfirm(timeSlotData);
    }
  };

  // Helper function to format time
  const formatTime = (time) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Helper function to get full date string
  const getFullDateString = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const dates = generateDates();

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-clock me-2"></i>
          Select Time Slot
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body>
        {/* Parking Spot Info */}
        {selectedSpot && (
          <Card className="mb-4">
            <Card.Body>
              <Row>
                <Col md={8}>
                  <h6 className="mb-1">{selectedSpot.name}</h6>
                  <small className="text-muted">{selectedSpot.address}</small>
                </Col>
                <Col md={4} className="text-end">
                  <Badge bg="primary" className="me-2">
                    {selectedVehicleType.toUpperCase()}
                  </Badge>
                  <Badge bg="success">
                    {selectedSpot.available_spots} spots available
                  </Badge>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        )}

        {/* Date Selection */}
        <Card className="mb-4">
          <Card.Header>
            <h6 className="mb-0">
              <i className="fas fa-calendar me-2"></i>
              Select Date
            </h6>
          </Card.Header>
          <Card.Body>
            {/* Quick Date Selection */}
            <div className="mb-3">
              <label className="form-label">Quick Select:</label>
              <Row>
                {generateDates().slice(0, 6).map((date) => (
                  <Col md={4} lg={2} key={date.value} className="mb-2">
                    <Button
                      variant={selectedDate === date.value ? 'primary' : 'outline-primary'}
                      size="sm"
                      className="w-100"
                      onClick={() => setSelectedDate(date.value)}
                    >
                      <div className="text-center">
                        <div className="fw-bold small">{date.label}</div>
                        <small>{date.value.split('-').slice(1).join('/')}</small>
                      </div>
                    </Button>
                  </Col>
                ))}
              </Row>
            </div>
            
            {/* Custom Date Picker */}
            <div className="mb-3">
              <label className="form-label">Or select any date:</label>
              <Form.Control
                type="date"
                value={selectedDate}
                min={getMinDate()}
                max={getMaxDate()}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto"
              />
            </div>

            {selectedDate && (
              <Alert variant="info" className="mb-0">
                <i className="fas fa-calendar-check me-2"></i>
                Selected: <strong>{getFullDateString(selectedDate)}</strong>
              </Alert>
            )}
          </Card.Body>
        </Card>

        {/* Visual Parking Slot Grid */}
        {selectedDate && (
          <ParkingSlotGrid
            selectedSpot={selectedSpot}
            selectedVehicleType={selectedVehicleType}
            selectedDate={selectedDate}
            selectedTimeSlot={useCustomTime ? startTime : selectedTimeSlot}
            onSlotSelect={(slots) => {
              setSelectedSlots(slots);
              console.log('Selected parking slots:', slots);
            }}
            refreshInterval={3000} // Manual refresh by default
          />
        )}

        {/* Real-Time Slot Availability */}
        {selectedDate && (
          <RealTimeSlotAvailability
            selectedSpot={selectedSpot}
            selectedVehicleType={selectedVehicleType}
            selectedDate={selectedDate}
            selectedTimeSlot={useCustomTime ? startTime : selectedTimeSlot}
            onSlotSelect={(slot) => {
              if (slot.available && slot.time) {
                setSelectedTimeSlot(slot.time);
                setUseCustomTime(false);
              }
            }}
            refreshInterval={5000} // Keep refresh interval but manual by default
          />
        )}

        {/* Time Selection Mode */}
        {selectedDate && (
          <Card className="mb-4">
            <Card.Header>
              <h6 className="mb-0">
                <i className="fas fa-clock me-2"></i>
                Time Selection Mode
              </h6>
            </Card.Header>
            <Card.Body>
              <div className="d-flex gap-3 mb-3">
                <Form.Check
                  type="radio"
                  id="predefined-slots"
                  name="timeMode"
                  label="Predefined Time Slots"
                  checked={!useCustomTime}
                  onChange={() => {
                    setUseCustomTime(false);
                    setStartTime('');
                    setEndTime('');
                  }}
                />
                <Form.Check
                  type="radio"
                  id="custom-time"
                  name="timeMode"
                  label="Custom Time Range"
                  checked={useCustomTime}
                  onChange={() => {
                    setUseCustomTime(true);
                    setSelectedTimeSlot('');
                  }}
                />
              </div>

              {useCustomTime ? (
                /* Custom Time Selection */
                <div>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Start Time</Form.Label>
                        <Form.Control
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>End Time</Form.Label>
                        <Form.Control
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  {startTime && endTime && (
                    <Alert variant="success">
                      <Row>
                        <Col md={6}>
                          <strong>Duration:</strong> {calculateDuration().toFixed(1)} hours
                        </Col>
                        <Col md={6}>
                          <strong>Total Amount:</strong> ₹{calculateTotalAmount()}
                        </Col>
                      </Row>
                      <small className="text-muted">
                        {formatTime(startTime)} to {formatTime(endTime)}
                        {startTime && endTime && new Date(`2000-01-01T${endTime}`) <= new Date(`2000-01-01T${startTime}`) && 
                          ' (next day)'}
                      </small>
                    </Alert>
                  )}
                </div>
              ) : (
                /* Predefined Time Slots */
                <div>
                  {loading ? (
                    <div className="text-center py-3">
                      <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading slots...</span>
                      </div>
                      <p className="mt-2 text-muted">Loading available time slots...</p>
                    </div>
                  ) : (
                    <Row>
                      {availableSlots.map((slot) => (
                        <Col md={4} lg={3} key={slot.value} className="mb-3">
                          <Button
                            variant={selectedTimeSlot === slot.value ? 'success' : slot.available ? 'outline-primary' : 'outline-secondary'}
                            className="w-100 position-relative"
                            disabled={!slot.available}
                            onClick={() => slot.available && setSelectedTimeSlot(slot.value)}
                          >
                            <div className="text-center">
                              <div className="fw-bold">{slot.label}</div>
                              <small>₹{slot.price}/hr</small>
                              {!slot.available && (
                                <div className="position-absolute top-50 start-50 translate-middle">
                                  <i className="fas fa-times text-danger"></i>
                                </div>
                              )}
                            </div>
                          </Button>
                        </Col>
                      ))}
                    </Row>
                  )}
                  
                  {availableSlots.length === 0 && !loading && (
                    <Alert variant="info">
                      <i className="fas fa-info-circle me-2"></i>
                      No predefined time slots available for the selected date. Please use custom time range.
                    </Alert>
                  )}
                </div>
              )}
            </Card.Body>
          </Card>
        )}

        {/* Booking Summary */}
        {((useCustomTime && startTime && endTime) || (!useCustomTime && selectedTimeSlot)) && selectedSlots.length > 0 && (
          <Card className="mb-3">
            <Card.Header>
              <h6 className="mb-0">
                <i className="fas fa-receipt me-2"></i>
                Booking Summary
              </h6>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={6}>
                  <p className="mb-1"><strong>Date:</strong> {getFullDateString(selectedDate)}</p>
                  <p className="mb-1">
                    <strong>Time:</strong> {
                      useCustomTime 
                        ? `${formatTime(startTime)} - ${formatTime(endTime)}${new Date(`2000-01-01T${endTime}`) <= new Date(`2000-01-01T${startTime}`) ? ' (next day)' : ''}`
                        : availableSlots.find(slot => slot.value === selectedTimeSlot)?.label
                    }
                  </p>
                  <p className="mb-1">
                    <strong>Duration:</strong> {
                      useCustomTime 
                        ? `${calculateDuration().toFixed(1)} hours`
                        : `${bookingForm.duration} hour(s)`
                    }
                  </p>
                  <p className="mb-1">
                    <strong>Selected Slots:</strong> {selectedSlots.length} slot(s)
                  </p>
                  <p className="mb-1">
                    <small className="text-muted">
                      Slots: {selectedSlots.map(slot => slot.slotNumber).join(', ')}
                    </small>
                  </p>
                </Col>
                <Col md={6}>
                  <p className="mb-1"><strong>Vehicle:</strong> {selectedVehicleType.toUpperCase()}</p>
                  <p className="mb-1">
                    <strong>Rate:</strong> ₹{
                      useCustomTime 
                        ? Math.round(calculateTotalAmount() / calculateDuration() / selectedSlots.length)
                        : availableSlots.find(slot => slot.value === selectedTimeSlot)?.price
                    }/hour per slot
                  </p>
                  <p className="mb-1">
                    <strong>Subtotal:</strong> ₹{
                      useCustomTime 
                        ? calculateTotalAmount()
                        : (availableSlots.find(slot => slot.value === selectedTimeSlot)?.price || 0) * bookingForm.duration
                    } × {selectedSlots.length} slot(s)
                  </p>
                  <p className="mb-1">
                    <strong>Total Amount:</strong> 
                    <span className="text-success fw-bold">
                      ₹{
                        useCustomTime 
                          ? calculateTotalAmount() * selectedSlots.length
                          : (availableSlots.find(slot => slot.value === selectedTimeSlot)?.price || 0) * bookingForm.duration * selectedSlots.length
                      }
                    </span>
                  </p>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        )}

        {/* Pricing Info */}
        <Alert variant="info">
          <h6><i className="fas fa-info-circle me-2"></i>Pricing Information</h6>
          <Row>
            <Col md={4}>
              <small><strong>Peak Hours (8-10 AM, 6-8 PM):</strong><br />+50% surcharge</small>
            </Col>
            <Col md={4}>
              <small><strong>Regular Hours (10 AM - 6 PM):</strong><br />Standard rates</small>
            </Col>
            <Col md={4}>
              <small><strong>Off-Peak (10 PM - 6 AM):</strong><br />25% discount</small>
            </Col>
          </Row>
        </Alert>
      </Modal.Body>
      
      <Modal.Footer>
        <Button variant="secondary" onClick={onBack}>
          <i className="fas fa-arrow-left me-2"></i>
          Back to Booking Details
        </Button>
        <Button 
          variant="primary" 
          onClick={handleConfirm}
          disabled={
            !selectedDate || 
            selectedSlots.length === 0 ||
            (useCustomTime ? (!startTime || !endTime) : !selectedTimeSlot) ||
            loading
          }
        >
          <i className="fas fa-credit-card me-2"></i>
          Proceed to Payment
          {((useCustomTime && startTime && endTime) || (!useCustomTime && selectedTimeSlot)) && selectedSlots.length > 0 && (
            <span className="ms-2">
              (₹{
                useCustomTime 
                  ? calculateTotalAmount() * selectedSlots.length
                  : (availableSlots.find(slot => slot.value === selectedTimeSlot)?.price || 0) * bookingForm.duration * selectedSlots.length
              } for {selectedSlots.length} slot{selectedSlots.length > 1 ? 's' : ''})
            </span>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TimeSlotSelection;