import { useState, useEffect } from 'react';
import { Modal, Form, Button, Alert, Card, Row, Col, Badge } from 'react-bootstrap';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';

const ExtendBooking = ({ 
  show, 
  onHide, 
  booking, 
  onExtendSuccess 
}) => {
  const [extendHours, setExtendHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const [extensionCost, setExtensionCost] = useState(0);
  const [newEndTime, setNewEndTime] = useState('');
  const [newTotalAmount, setNewTotalAmount] = useState(0);
  const { user } = useAuth();

  // Calculate extension details when extend hours change
  useEffect(() => {
    if (booking && extendHours > 0) {
      calculateExtension();
    }
  }, [booking, extendHours]);

  const calculateExtension = () => {
    if (!booking) return;

    // Calculate extension cost
    const hourlyRate = booking.price_per_hour || booking.total_price / booking.duration;
    const extensionAmount = hourlyRate * extendHours;
    
    // Calculate new end time
    const currentEndTime = new Date(`${booking.booking_date}T${booking.end_time || booking.booking_time}`);
    const newEnd = new Date(currentEndTime.getTime() + (extendHours * 60 * 60 * 1000));
    
    // Calculate new total amount
    const newTotal = (booking.total_price || 0) + extensionAmount;
    
    setExtensionCost(extensionAmount);
    setNewEndTime(newEnd.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    }));
    setNewTotalAmount(newTotal);
  };

  const handleExtendBooking = async () => {
    if (!booking || extendHours <= 0) {
      toast.error('Please select valid extension hours');
      return;
    }

    try {
      setLoading(true);
      
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please login to extend booking');
        return;
      }

      const extensionData = {
        booking_id: booking.id,
        extend_hours: extendHours,
        extension_cost: extensionCost,
        new_end_time: newEndTime,
        new_total_amount: newTotalAmount
      };

      const response = await axios.post('/api/bookings/extend', extensionData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        toast.success(`Booking extended by ${extendHours} hour(s) successfully!`);
        toast.info(`Additional amount: ₹${extensionCost}`);
        
        if (onExtendSuccess) {
          onExtendSuccess(response.data.booking);
        }
        
        onHide();
        
        // Reset form
        setExtendHours(1);
        setExtensionCost(0);
        setNewEndTime('');
        setNewTotalAmount(0);
      } else {
        toast.error(response.data.error || 'Failed to extend booking');
      }
    } catch (error) {
      console.error('Extend booking error:', error);
      if (error.response?.status === 401) {
        toast.error('Please login again to extend booking');
      } else {
        toast.error(error.response?.data?.error || 'Failed to extend booking');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    const time = new Date(`2000-01-01T${timeString}`);
    return time.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDateTime = (date, time) => {
    if (!date || !time) return '';
    return `${new Date(date).toLocaleDateString()} at ${formatTime(time)}`;
  };

  if (!booking) return null;

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-clock me-2"></i>
          Extend Parking Time
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body>
        {/* Current Booking Details */}
        <Card className="mb-4">
          <Card.Header>
            <h6 className="mb-0">
              <i className="fas fa-info-circle me-2"></i>
              Current Booking Details
            </h6>
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <p className="mb-1"><strong>Booking ID:</strong> {booking.booking_ref || booking.id}</p>
                <p className="mb-1"><strong>Parking Spot:</strong> {booking.spot_name || 'Selected Spot'}</p>
                <p className="mb-1"><strong>Vehicle:</strong> {booking.vehicle_number} ({booking.vehicle_type})</p>
                <p className="mb-1"><strong>Current Duration:</strong> {booking.duration} hour(s)</p>
              </Col>
              <Col md={6}>
                <p className="mb-1"><strong>Start Time:</strong> {formatDateTime(booking.booking_date, booking.booking_time)}</p>
                <p className="mb-1"><strong>Current End Time:</strong> {formatDateTime(booking.booking_date, booking.end_time || booking.booking_time)}</p>
                <p className="mb-1"><strong>Current Amount:</strong> ₹{booking.total_price}</p>
                <p className="mb-1">
                  <strong>Status:</strong> 
                  <Badge bg={booking.status === 'active' ? 'success' : 'warning'} className="ms-2">
                    {booking.status?.toUpperCase()}
                  </Badge>
                </p>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Extension Form */}
        <Card className="mb-4">
          <Card.Header>
            <h6 className="mb-0">
              <i className="fas fa-plus-circle me-2"></i>
              Extend Parking Time
            </h6>
          </Card.Header>
          <Card.Body>
            <Form.Group className="mb-3">
              <Form.Label>Additional Hours</Form.Label>
              <Form.Select
                value={extendHours}
                onChange={(e) => setExtendHours(parseInt(e.target.value))}
              >
                <option value={1}>1 hour</option>
                <option value={2}>2 hours</option>
                <option value={3}>3 hours</option>
                <option value={4}>4 hours</option>
                <option value={5}>5 hours</option>
                <option value={6}>6 hours</option>
                <option value={8}>8 hours</option>
                <option value={12}>12 hours</option>
              </Form.Select>
              <Form.Text className="text-muted">
                Select how many additional hours you need
              </Form.Text>
            </Form.Group>

            {/* Custom Hours Input */}
            <Form.Group className="mb-3">
              <Form.Label>Or Enter Custom Hours</Form.Label>
              <Form.Control
                type="number"
                min="0.5"
                max="24"
                step="0.5"
                value={extendHours}
                onChange={(e) => setExtendHours(parseFloat(e.target.value) || 1)}
                placeholder="Enter hours (e.g., 1.5 for 1 hour 30 minutes)"
              />
              <Form.Text className="text-muted">
                You can enter decimal values (e.g., 1.5 for 1 hour 30 minutes)
              </Form.Text>
            </Form.Group>
          </Card.Body>
        </Card>

        {/* Extension Summary */}
        {extendHours > 0 && (
          <Card className="mb-4">
            <Card.Header>
              <h6 className="mb-0">
                <i className="fas fa-calculator me-2"></i>
                Extension Summary
              </h6>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={6}>
                  <div className="mb-3">
                    <strong>Extension Details:</strong>
                    <ul className="mt-2 mb-0">
                      <li>Additional Time: {extendHours} hour(s)</li>
                      <li>Hourly Rate: ₹{(booking.total_price / booking.duration).toFixed(2)}/hour</li>
                      <li>Extension Cost: ₹{extensionCost.toFixed(2)}</li>
                    </ul>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="mb-3">
                    <strong>Updated Booking:</strong>
                    <ul className="mt-2 mb-0">
                      <li>New End Time: {newEndTime ? formatTime(newEndTime) : 'Calculating...'}</li>
                      <li>Total Duration: {(booking.duration + extendHours)} hour(s)</li>
                      <li>New Total Amount: ₹{newTotalAmount.toFixed(2)}</li>
                    </ul>
                  </div>
                </Col>
              </Row>
              
              <Alert variant="info" className="mb-0">
                <Row>
                  <Col md={8}>
                    <strong>Payment Required:</strong> ₹{extensionCost.toFixed(2)} for {extendHours} additional hour(s)
                  </Col>
                  <Col md={4} className="text-end">
                    <Badge bg="primary" className="fs-6">
                      Total: ₹{newTotalAmount.toFixed(2)}
                    </Badge>
                  </Col>
                </Row>
              </Alert>
            </Card.Body>
          </Card>
        )}

        {/* Important Notes */}
        <Alert variant="warning">
          <h6><i className="fas fa-exclamation-triangle me-2"></i>Important Notes</h6>
          <ul className="mb-0">
            <li>Extension payment will be processed immediately</li>
            <li>You will receive email confirmation for the extension</li>
            <li>The new end time will be updated in your booking</li>
            <li>Extension is subject to parking spot availability</li>
          </ul>
        </Alert>
      </Modal.Body>
      
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={loading}>
          Cancel
        </Button>
        <Button 
          variant="success" 
          onClick={handleExtendBooking}
          disabled={loading || extendHours <= 0}
        >
          {loading ? (
            <>
              <i className="fas fa-spinner fa-spin me-2"></i>
              Processing Extension...
            </>
          ) : (
            <>
              <i className="fas fa-credit-card me-2"></i>
              Pay ₹{extensionCost.toFixed(2)} & Extend
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ExtendBooking;