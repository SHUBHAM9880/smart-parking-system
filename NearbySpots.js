import React, { useState, useEffect } from 'react';
import { Card, Alert, Spinner, Badge, Button } from 'react-bootstrap';
import LocationMap from '../LocationMap/LocationMap';
import axios from 'axios';
import { toast } from 'react-toastify';

const NearbySpots = ({ location, showBookingButtons = false, onSpotSelect, citySearchResults = [] }) => {
  const [nearbySpots, setNearbySpots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    if (location && location.latitude && location.longitude) {
      fetchNearbySpots();
    }
    fetchUserInfo();
  }, [location]);

  // Use city search results if available, otherwise use nearby spots
  const spotsToDisplay = citySearchResults.length > 0 ? citySearchResults : nearbySpots;

  const fetchUserInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setUserInfo(response.data.user);
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  };

  const fetchNearbySpots = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Show message that system is finding/creating parking spots
      toast.info('🔍 Finding nearby parking spots...');
      
      const response = await axios.get('/api/location/nearby-spots?radius=10&limit=20', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setNearbySpots(response.data.spots);
      
      // Check if any spots were found at user's exact location (likely auto-created)
      const userLat = response.data.user_location.latitude;
      const userLng = response.data.user_location.longitude;
      
      const spotsAtUserLocation = response.data.spots.filter(spot => {
        const distance = Math.abs(spot.latitude - userLat) + Math.abs(spot.longitude - userLng);
        return distance < 0.001; // Very close to user location
      });
      
      if (spotsAtUserLocation.length > 0) {
        toast.success(`🅿️ Found ${response.data.spots.length} parking spots including one at your location!`);
      } else {
        toast.success(`🅿️ Found ${response.data.spots.length} nearby parking spots`);
      }
      
    } catch (error) {
      console.error('Failed to fetch nearby spots:', error);
      toast.error('Failed to fetch nearby parking spots');
    } finally {
      setLoading(false);
    }
  };

  if (!location || !location.latitude || !location.longitude) {
    return null;
  }

  if (loading && nearbySpots.length === 0) {
    return (
      <Card className="mb-4">
        <Card.Body>
          <div className="text-center py-4">
            <Spinner animation="border" />
            <p className="mt-2">🔍 Finding nearby parking spots...</p>
            <small className="text-muted">Creating parking spots at your location if needed</small>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <Card.Header>
        <h5 className="mb-0">
          {citySearchResults.length > 0 ? (
            <>🏙️ Parking Spots in {location?.city || 'Selected City'}</>
          ) : (
            <>🗺️ Nearby Parking Spots</>
          )}
        </h5>
      </Card.Header>
      <Card.Body>
        {spotsToDisplay.length === 0 ? (
          <Alert variant="info">
            <h6>🔍 {citySearchResults.length > 0 ? 'City Search' : 'Searching for Parking Spots'}</h6>
            <p className="mb-0">
              {citySearchResults.length > 0 
                ? 'No parking spots found in the selected city. Try searching for a different city.'
                : 'We\'re looking for nearby parking spots and will create one at your location if none are found. This ensures you always have parking available where you need it!'
              }
            </p>
          </Alert>
        ) : (
          <div>
            {/* Map View */}
            {location && (
              <div className="mb-4">
                <h6 className="mb-3">🗺️ Map View</h6>
                <LocationMap
                  latitude={location.latitude}
                  longitude={location.longitude}
                  zoom={citySearchResults.length > 0 ? 12 : 14}
                  height="300px"
                  showUserLocation={!citySearchResults.length > 0}
                  userInfo={userInfo}
                  nearbySpots={spotsToDisplay}
                  onLocationClick={(loc) => {
                    toast.info(`Location: ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`);
                  }}
                />
              </div>
            )}
            
            {/* Spots List */}
            <h6 className="mb-3">
              📋 {citySearchResults.length > 0 ? 'City Parking Spots' : 'Available Spots'}
              {citySearchResults.length > 0 && (
                <Badge bg="success" className="ms-2">
                  {spotsToDisplay.length} spots found
                </Badge>
              )}
            </h6>
            <div className="row">
              {spotsToDisplay.map((spot) => (
                <div key={spot.id} className="col-md-6 col-lg-4 mb-3">
                  <Card className="h-100">
                    <Card.Body>
                      <Card.Title className="h6">{spot.name}</Card.Title>
                      <Card.Text className="small text-muted">
                        {spot.address}
                      </Card.Text>
                      <div className="mb-2">
                        <Badge bg={spot.available_spots > 0 ? 'success' : 'danger'}>
                          {spot.available_spots} spots available
                        </Badge>
                        {spot.distance_km !== undefined && (
                          <Badge bg="info" className="ms-2">
                            {spot.distance_km.toFixed(1)} km away
                          </Badge>
                        )}
                      </div>
                      <div className="mb-3">
                        <small>
                          <strong>Pricing:</strong><br />
                          {spot.car_price_per_hour && `Car: ₹${spot.car_price_per_hour}/hr`}<br />
                          {spot.bike_price_per_hour && `Bike: ₹${spot.bike_price_per_hour}/hr`}<br />
                          {spot.truck_price_per_hour && `Truck: ₹${spot.truck_price_per_hour}/hr`}
                        </small>
                      </div>
                      {showBookingButtons && (
                        <Button 
                          variant="primary" 
                          size="sm" 
                          disabled={spot.available_spots === 0}
                          onClick={() => onSpotSelect && onSpotSelect(spot)}
                        >
                          Book Now
                        </Button>
                      )}
                    </Card.Body>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default NearbySpots;