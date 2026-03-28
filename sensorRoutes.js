const express = require('express');
const Sensor = require('../models/Sensor');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Get all sensors with filters
router.get('/', async (req, res) => {
  try {
    const {
      status, sensor_type, spot_id, low_battery, weak_signal,
      sortBy, limit, offset
    } = req.query;

    const filters = {};
    
    if (status) filters.status = status;
    if (sensor_type) filters.sensor_type = sensor_type;
    if (spot_id) filters.spot_id = parseInt(spot_id);
    if (low_battery) filters.low_battery = parseInt(low_battery);
    if (weak_signal) filters.weak_signal = parseInt(weak_signal);
    if (sortBy) filters.sortBy = sortBy;
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    const sensors = await Sensor.getAll(filters);

    res.json({
      success: true,
      sensors: sensors.map(sensor => sensor.toJSON()),
      count: sensors.length
    });
  } catch (error) {
    console.error('Error fetching sensors:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get sensor by ID
router.get('/:id', async (req, res) => {
  try {
    const sensor = await Sensor.findById(req.params.id);
    
    if (!sensor) {
      return res.status(404).json({ 
        success: false,
        error: 'Sensor not found' 
      });
    }

    res.json({
      success: true,
      sensor: sensor.toJSON()
    });
  } catch (error) {
    console.error('Error fetching sensor:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get sensor statistics
router.get('/statistics/summary', async (req, res) => {
  try {
    const statistics = await Sensor.getStatistics();

    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Error fetching sensor statistics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get sensors needing attention
router.get('/maintenance/needed', async (req, res) => {
  try {
    const sensors = await Sensor.getNeedingAttention();

    res.json({
      success: true,
      sensors: sensors.map(sensor => sensor.toJSON()),
      count: sensors.length
    });
  } catch (error) {
    console.error('Error fetching sensors needing attention:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Update sensor reading
router.patch('/:id/reading', async (req, res) => {
  try {
    const { reading } = req.body;
    
    if (!reading) {
      return res.status(400).json({ 
        success: false,
        error: 'Reading data is required' 
      });
    }

    const sensor = await Sensor.findById(req.params.id);
    if (!sensor) {
      return res.status(404).json({ 
        success: false,
        error: 'Sensor not found' 
      });
    }

    await sensor.updateReading(reading);

    res.json({
      success: true,
      message: 'Sensor reading updated successfully',
      sensor: sensor.toJSON()
    });
  } catch (error) {
    console.error('Error updating sensor reading:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Update sensor status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false,
        error: 'Status is required' 
      });
    }

    const validStatuses = ['online', 'offline', 'maintenance', 'error'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid status' 
      });
    }

    const sensor = await Sensor.findById(req.params.id);
    if (!sensor) {
      return res.status(404).json({ 
        success: false,
        error: 'Sensor not found' 
      });
    }

    await sensor.setStatus(status);

    res.json({
      success: true,
      message: 'Sensor status updated successfully',
      sensor: sensor.toJSON()
    });
  } catch (error) {
    console.error('Error updating sensor status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Record maintenance
router.post('/:id/maintenance', authenticateToken, async (req, res) => {
  try {
    const sensor = await Sensor.findById(req.params.id);
    if (!sensor) {
      return res.status(404).json({ 
        success: false,
        error: 'Sensor not found' 
      });
    }

    await sensor.recordMaintenance();

    res.json({
      success: true,
      message: 'Maintenance recorded successfully',
      sensor: sensor.toJSON()
    });
  } catch (error) {
    console.error('Error recording maintenance:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Bulk update sensor readings (for IoT integration)
router.post('/bulk/readings', async (req, res) => {
  try {
    const { readings } = req.body;
    
    if (!readings || !Array.isArray(readings)) {
      return res.status(400).json({ 
        success: false,
        error: 'Readings array is required' 
      });
    }

    await Sensor.bulkUpdateReadings(readings);

    res.json({
      success: true,
      message: 'Sensor readings updated successfully',
      updated_count: readings.length
    });
  } catch (error) {
    console.error('Error bulk updating sensor readings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Generate mock reading for demo
router.post('/:id/mock-reading', async (req, res) => {
  try {
    const sensor = await Sensor.findById(req.params.id);
    if (!sensor) {
      return res.status(404).json({ 
        success: false,
        error: 'Sensor not found' 
      });
    }

    const mockReading = Sensor.generateMockReading(sensor.sensor_type);
    await sensor.updateReading(mockReading);

    res.json({
      success: true,
      message: 'Mock reading generated and updated',
      reading: mockReading,
      sensor: sensor.toJSON()
    });
  } catch (error) {
    console.error('Error generating mock reading:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

module.exports = router;