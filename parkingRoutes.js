const express = require('express');
const ParkingSpot = require('../models/ParkingSpot');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Get all parking spots with filters (exclude expired spots)
router.get('/', async (req, res) => {
  try {
    const {
      minPrice, maxPrice, availableOnly, features, latitude, longitude,
      radius, sortBy, limit, offset
    } = req.query;

    const filters = {};
    
    if (minPrice) filters.minPrice = parseFloat(minPrice);
    if (maxPrice) filters.maxPrice = parseFloat(maxPrice);
    if (availableOnly === 'true') filters.availableOnly = true;
    if (features) filters.features = features.split(',');
    if (latitude && longitude) {
      filters.latitude = parseFloat(latitude);
      filters.longitude = parseFloat(longitude);
      if (radius) filters.radius = parseFloat(radius);
    }
    if (sortBy) filters.sortBy = sortBy;
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    // Add filter to exclude expired spots for regular users
    filters.excludeExpired = true;

    const spots = await ParkingSpot.getAll(filters);

    res.json({
      success: true,
      spots: spots.map(spot => spot.toJSON()),
      count: spots.length
    });
  } catch (error) {
    console.error('Error fetching parking spots:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get real-time slot availability
router.get('/real-time-availability/:id', async (req, res) => {
  try {
    const { date, vehicle_type, time_slot } = req.query;
    const spotId = req.params.id;

    const spot = await ParkingSpot.findById(spotId);
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    // Get real-time availability data
    const availabilityData = await spot.getRealTimeAvailability(date, vehicle_type, time_slot);

    res.json({
      success: true,
      data: availabilityData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching real-time availability:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get parking spot by ID
router.get('/:id', async (req, res) => {
  try {
    const spot = await ParkingSpot.findById(req.params.id);
    
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    res.json({
      success: true,
      spot: spot.toJSON()
    });
  } catch (error) {
    console.error('Error fetching parking spot:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get parking spot statistics
router.get('/:id/statistics', async (req, res) => {
  try {
    const spot = await ParkingSpot.findById(req.params.id);
    
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    const statistics = await spot.getStatistics();

    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Error fetching spot statistics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get recent bookings for a spot
router.get('/:id/bookings', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const spot = await ParkingSpot.findById(req.params.id);
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    const bookings = await spot.getRecentBookings(parseInt(limit));

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error('Error fetching spot bookings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get reviews for a spot
router.get('/:id/reviews', async (req, res) => {
  try {
    const { limit = 10, offset = 0, rating, sortBy } = req.query;
    
    const spot = await ParkingSpot.findById(req.params.id);
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    const filters = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    if (rating) filters.rating = parseInt(rating);
    if (sortBy) filters.sortBy = sortBy;

    const reviews = await spot.getReviews(filters.limit, filters.offset);

    res.json({
      success: true,
      reviews
    });
  } catch (error) {
    console.error('Error fetching spot reviews:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get sensors for a spot
router.get('/:id/sensors', async (req, res) => {
  try {
    const spot = await ParkingSpot.findById(req.params.id);
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    const sensors = await spot.getSensors();

    res.json({
      success: true,
      sensors
    });
  } catch (error) {
    console.error('Error fetching spot sensors:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Find nearby parking spots
router.get('/nearby/:latitude/:longitude', async (req, res) => {
  try {
    const { latitude, longitude } = req.params;
    const { radius = 5, limit = 10 } = req.query;

    const spots = await ParkingSpot.findNearby(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(radius),
      parseInt(limit)
    );

    res.json({
      success: true,
      spots: spots.map(spot => spot.toJSON()),
      count: spots.length
    });
  } catch (error) {
    console.error('Error finding nearby spots:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get popular parking spots
router.get('/popular/list', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const spots = await ParkingSpot.getPopular(parseInt(limit));

    res.json({
      success: true,
      spots: spots.map(spot => spot.toJSON()),
      count: spots.length
    });
  } catch (error) {
    console.error('Error fetching popular spots:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Create new parking spot (admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // In a real app, you'd check if user is admin
    const {
      name, address, latitude, longitude, total_spots,
      available_spots, price_per_hour, features, images
    } = req.body;

    // Validate required fields
    if (!name || !address || !latitude || !longitude || !total_spots || !price_per_hour) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields' 
      });
    }

    const spotId = await ParkingSpot.create({
      name, address, latitude, longitude, total_spots,
      available_spots, price_per_hour, features, images
    });

    const spot = await ParkingSpot.findById(spotId);

    res.status(201).json({
      success: true,
      message: 'Parking spot created successfully',
      spot: spot.toJSON()
    });
  } catch (error) {
    console.error('Error creating parking spot:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Update parking spot (admin only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const spot = await ParkingSpot.findById(req.params.id);
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    const updateData = req.body;
    await spot.update(updateData);

    res.json({
      success: true,
      message: 'Parking spot updated successfully',
      spot: spot.toJSON()
    });
  } catch (error) {
    console.error('Error updating parking spot:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Update spot availability
router.patch('/:id/availability', authenticateToken, async (req, res) => {
  try {
    const { change } = req.body; // +1 or -1
    
    if (change === undefined) {
      return res.status(400).json({ 
        success: false,
        error: 'Change value is required' 
      });
    }

    const spot = await ParkingSpot.findById(req.params.id);
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    await spot.updateAvailability(parseInt(change));

    res.json({
      success: true,
      message: 'Availability updated successfully',
      available_spots: spot.available_spots
    });
  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Delete parking spot (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const spot = await ParkingSpot.findById(req.params.id);
    if (!spot) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking spot not found' 
      });
    }

    await spot.delete(); // Soft delete

    res.json({
      success: true,
      message: 'Parking spot deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting parking spot:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

module.exports = router;