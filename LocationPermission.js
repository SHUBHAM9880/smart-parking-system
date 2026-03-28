import React, { useState, useEffect } from 'react';
import { Card, Button, Alert, Badge, Spinner } from 'react-bootstrap';
import LocationPermissionModal from '../LocationPermissionModal/LocationPermissionModal';
import axios from 'axios';
import { toast } from 'react-toastify';

const LocationPermission = ({ onLocationGranted }) => {
  const [location, setLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    checkLocationPermission();
    fetchUserInfo();
  }, []);

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

  const checkLocationPermission = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/location/current', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const locationData = response.data.location;
      setLocation(locationData);
      setLocationPermission(locationData.permission);
      
      if (locationData.permission && locationData.latitude && locationData.longitude) {
        if (!locationData.is_recent) {
          requestCurrentLocation();
        }
      }
    } catch (error) {
      console.error('Failed to check location permission:', error);
    }
  };

  const requestLocationPermission = () => {
    setShowPermissionModal(true);
  };

  const handlePermissionGranted = (locationData) => {
    setLocation(locationData);
    setLocationPermission(true);
    setTimeout(() => {
      checkLocationPermission();
      if (onLocationGranted) onLocationGranted(locationData);
    }, 2000);
  };

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          const token = localStorage.getItem('token');
          await axios.post('/api/location/update',
            { latitude, longitude },
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          
          setLocation({ latitude, longitude, is_recent: true });
          toast.success('Location updated successfully!');
          if (onLocationGranted) onLocationGranted({ latitude, longitude });
        } catch (error) {
          console.error('Failed to update location:', error);
          toast.error('Failed to update location');
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        setLoading(false);
        console.error('Geolocation error:', error);
        toast.error('Failed to get current location');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  if (!locationPermission) {
    return (
      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0">📍 Location Permission Required</h5>
        </Card.Header>
        <Card.Body>
          <Alert variant="warning">
            <strong>Location Permission Required</strong>
            <p className="mb-3">
              To find nearby parking spots, we need access to your location.
            </p>
            <Button variant="primary" onClick={requestLocationPermission}>
              Grant Location Permission
            </Button>
          </Alert>
        </Card.Body>

        <LocationPermissionModal
          show={showPermissionModal}
          onHide={() => setShowPermissionModal(false)}
          onPermissionGranted={handlePermissionGranted}
          userInfo={userInfo}
        />
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h5 className="mb-0">📍 Location Status</h5>
        <div>
          <Badge bg="success" className="me-2">
            Location: {location?.is_recent ? 'Current' : 'Outdated'}
          </Badge>
          <Button 
            variant="outline-primary" 
            size="sm" 
            onClick={requestCurrentLocation}
            disabled={loading}
          >
            {loading ? <Spinner animation="border" size="sm" /> : 'Refresh Location'}
          </Button>
        </div>
      </Card.Header>
      <Card.Body>
        <Alert variant="success">
          <i className="fas fa-check-circle me-2"></i>
          Location permission granted! You can now find nearby parking spots.
        </Alert>
      </Card.Body>
    </Card>
  );
};

export default LocationPermission;