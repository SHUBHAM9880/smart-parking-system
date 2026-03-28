import React, { useState } from 'react';
import { Container, Row, Col, ButtonGroup, Button, Form, InputGroup, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import LocationPermission from '../../components/LocationPermission/LocationPermission';
import NearbySpots from '../../components/NearbySpots/NearbySpots';
import BookingModal from '../../components/BookingModal/BookingModal';
import axios from 'axios';

const ParkingMap = () => {
  const [location, setLocation] = useState(null);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [selectedVehicleType, setSelectedVehicleType] = useState('car');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [cityName, setCityName] = useState('');
  const [searchingCity, setSearchingCity] = useState(false);
  const [citySearchResults, setCitySearchResults] = useState([]);

  const handleSpotSelect = (spot) => {
    setSelectedSpot(spot);
    setShowBookingModal(true);
  };

  const handleBookingSuccess = (booking) => {
    toast.success(`Booking confirmed! Reference: ${booking.booking_ref || booking.id}`);
    setShowBookingModal(false);
    setSelectedSpot(null);
  };

  // Function to search for city and create parking spots
  const handleCitySearch = async () => {
    if (!cityName.trim()) {
      toast.error('Please enter a city name');
      return;
    }

    setSearchingCity(true);
    setCitySearchResults([]);

    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        toast.error('Please login first to search for parking');
        setSearchingCity(false);
        return;
      }

      toast.info(`🔍 Searching for parking spots in ${cityName}...`);

      // Call the city search API that will create parking spots automatically
      const response = await axios.post('/api/location/search-city', {
        cityName: cityName.trim()
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        setCitySearchResults(response.data.spots);
        
        if (response.data.spots_created > 0) {
          toast.success(`🅿️ Created ${response.data.spots_created} parking spots in ${cityName}!`);
        } else {
          toast.success(`🅿️ Found ${response.data.spots.length} existing parking spots in ${cityName}`);
        }

        // Set location to the city center for map display
        if (response.data.city_location) {
          setLocation({
            latitude: response.data.city_location.latitude,
            longitude: response.data.city_location.longitude,
            city: cityName
          });
        }
      } else {
        toast.error(response.data.error || 'Failed to search city');
      }

    } catch (error) {
      console.error('City search error:', error);
      toast.error('Failed to search for parking in the city');
    } finally {
      setSearchingCity(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleCitySearch();
    }
  };

  return (
    <Container className="py-4">
      <Row className="mb-4">
        <Col>
          <h2>
            <i className="fas fa-map-marker-alt me-2"></i>
            Find Parking Spots
          </h2>
          <p className="text-muted">Search by city name or grant location permission to discover nearby parking spots</p>
        </Col>
      </Row>

      {/* City Search Section */}
      <Row className="mb-4">
        <Col>
          <h5>🏙️ Search by City Name</h5>
          <InputGroup className="mb-3">
            <Form.Control
              type="text"
              placeholder="Enter city name (e.g., Delhi, Mumbai, Bangalore)"
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={searchingCity}
            />
            <Button 
              variant="primary" 
              onClick={handleCitySearch}
              disabled={searchingCity || !cityName.trim()}
            >
              {searchingCity ? (
                <>
                  <i className="fas fa-spinner fa-spin me-2"></i>
                  Searching...
                </>
              ) : (
                <>
                  <i className="fas fa-search me-2"></i>
                  Search City
                </>
              )}
            </Button>
          </InputGroup>
          
          {citySearchResults.length > 0 && (
            <Alert variant="success">
              <h6>🎉 City Search Results</h6>
              <p className="mb-0">
                Found {citySearchResults.length} parking spots in {cityName}. 
                Parking spots have been automatically created for your convenience!
              </p>
            </Alert>
          )}
        </Col>
      </Row>

      {/* Vehicle Type Selection */}
      <Row className="mb-4">
        <Col>
          <h5>🚗 Select Vehicle Type</h5>
          <ButtonGroup>
            <Button 
              variant={selectedVehicleType === 'car' ? 'primary' : 'outline-primary'}
              onClick={() => setSelectedVehicleType('car')}
            >
              🚗 Car
            </Button>
            <Button 
              variant={selectedVehicleType === 'bike' ? 'primary' : 'outline-primary'}
              onClick={() => setSelectedVehicleType('bike')}
            >
              🏍️ Bike
            </Button>
            <Button 
              variant={selectedVehicleType === 'truck' ? 'primary' : 'outline-primary'}
              onClick={() => setSelectedVehicleType('truck')}
            >
              🚛 Truck
            </Button>
          </ButtonGroup>
        </Col>
      </Row>

      {/* Location Permission Component */}
      <LocationPermission 
        onLocationGranted={(locationData) => {
          setLocation(locationData);
          toast.success('Location permission granted! Now you can see nearby parking spots.');
        }} 
      />

      {/* Nearby Spots Component - Shows booking functionality */}
      <NearbySpots 
        location={location}
        showBookingButtons={true}
        onSpotSelect={handleSpotSelect}
        citySearchResults={citySearchResults}
      />

      {/* Booking Modal with Payment Features */}
      <BookingModal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        selectedSpot={selectedSpot}
        selectedVehicleType={selectedVehicleType}
        onBookingSuccess={handleBookingSuccess}
      />
    </Container>
  );
};

export default ParkingMap;