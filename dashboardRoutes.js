const express = require('express');
const Booking = require('../models/Booking');
const ParkingSpot = require('../models/ParkingSpot');
const Sensor = require('../models/Sensor');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Get dashboard statistics for authenticated user
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user statistics
    const user = await User.findById(userId);
    const userStats = user ? await user.getStatistics() : {
      total_bookings: 0,
      total_spent: 0,
      total_hours: 0,
      active_bookings: 0,
      completed_bookings: 0
    };

    // Get overall system statistics
    const [totalSpotsResult] = await require('../config/database').getDatabase().query(
      'SELECT SUM(available_spots) as available_spots, SUM(total_spots) as total_spots FROM parking_spots WHERE is_active = TRUE'
    );

    // Get sensor statistics
    const sensorStats = await Sensor.getStatistics();

    // Get recent bookings
    const recentBookings = await Booking.getByUserId(userId, { limit: 5 });

    const stats = {
      totalBookings: userStats.total_bookings || 0,
      availableSpots: totalSpotsResult[0]?.available_spots || 0,
      totalSpots: totalSpotsResult[0]?.total_spots || 0,
      totalRevenue: userStats.total_spent || 0,
      totalHours: userStats.total_hours || 0,
      activeBookings: userStats.active_bookings || 0,
      completedBookings: userStats.completed_bookings || 0,
      sensorStats: {
        online: sensorStats.online_sensors || 0,
        offline: sensorStats.offline_sensors || 0,
        maintenance: sensorStats.maintenance_sensors || 0,
        error: sensorStats.error_sensors || 0,
        total: sensorStats.total_sensors || 0,
        coverage: sensorStats.total_sensors > 0 ? 
          ((sensorStats.online_sensors / sensorStats.total_sensors) * 100).toFixed(1) : 0
      },
      recentBookings: recentBookings.map(booking => booking.toJSON())
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      stats: {
        totalBookings: 0,
        availableSpots: 0,
        totalRevenue: 0,
        sensorStats: {
          online: 247,
          offline: 1,
          maintenance: 3,
          error: 0
        }
      }
    });
  }
});

// Get admin dashboard statistics
router.get('/admin/stats', authenticateToken, async (req, res) => {
  try {
    // In a real app, check if user is admin
    
    // Get overall booking statistics
    const bookingStats = await Booking.getStatistics();
    
    // Get parking spot statistics
    const [spotStats] = await require('../config/database').getDatabase().query(`
      SELECT 
        COUNT(*) as total_spots,
        SUM(total_spots) as total_capacity,
        SUM(available_spots) as available_spots,
        AVG(rating) as avg_rating,
        SUM(total_spots - available_spots) as occupied_spots
      FROM parking_spots 
      WHERE is_active = TRUE
    `);

    // Get sensor statistics
    const sensorStats = await Sensor.getStatistics();

    // Get user statistics
    const [userStats] = await require('../config/database').getDatabase().query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_verified = TRUE THEN 1 END) as verified_users,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_users_month
      FROM users
    `);

    // Get revenue statistics
    const [revenueStats] = await require('../config/database').getDatabase().query(`
      SELECT 
        SUM(total_price) as total_revenue,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_price ELSE 0 END) as today_revenue,
        SUM(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN total_price ELSE 0 END) as week_revenue,
        SUM(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN total_price ELSE 0 END) as month_revenue
      FROM bookings 
      WHERE status = 'completed'
    `);

    const adminStats = {
      bookings: bookingStats,
      spots: spotStats[0],
      sensors: sensorStats,
      users: userStats[0],
      revenue: revenueStats[0],
      utilization: spotStats[0].total_capacity > 0 ? 
        ((spotStats[0].occupied_spots / spotStats[0].total_capacity) * 100).toFixed(1) : 0
    };

    res.json({
      success: true,
      stats: adminStats
    });
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get real-time booking statistics
router.get('/realtime-stats', async (req, res) => {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();

    // Get comprehensive real-time statistics
    const [bookingStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_bookings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_bookings,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_hour_bookings,
        SUM(total_price) as total_revenue,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_price ELSE 0 END) as today_revenue,
        AVG(duration) as avg_duration
      FROM bookings
    `);

    // Get parking spot availability statistics
    const [spotStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_spots,
        SUM(total_spots) as total_capacity,
        SUM(available_spots) as available_spots,
        SUM(car_spots) as total_car_spots,
        SUM(available_car_spots) as available_car_spots,
        SUM(bike_spots) as total_bike_spots,
        SUM(available_bike_spots) as available_bike_spots,
        SUM(truck_spots) as total_truck_spots,
        SUM(available_truck_spots) as available_truck_spots,
        AVG(rating) as avg_rating
      FROM parking_spots 
      WHERE is_active = TRUE
    `);

    // Get current occupancy by vehicle type
    const [occupancyStats] = await db.execute(`
      SELECT 
        vehicle_type,
        COUNT(*) as active_bookings,
        SUM(duration) as total_hours_booked
      FROM bookings 
      WHERE status IN ('active', 'confirmed')
      GROUP BY vehicle_type
    `);

    // Get hourly booking trends for today
    const [hourlyTrends] = await db.execute(`
      SELECT 
        HOUR(created_at) as hour,
        COUNT(*) as bookings,
        SUM(total_price) as revenue
      FROM bookings 
      WHERE DATE(created_at) = CURDATE()
      GROUP BY HOUR(created_at)
      ORDER BY hour ASC
    `);

    // Get recent bookings (last 10)
    const [recentBookings] = await db.execute(`
      SELECT 
        b.id,
        b.booking_ref,
        b.vehicle_number,
        b.vehicle_type,
        b.status,
        b.total_price,
        b.duration,
        b.created_at,
        ps.name as spot_name,
        u.name as user_name
      FROM bookings b
      LEFT JOIN parking_spots ps ON b.spot_id = ps.id
      LEFT JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
      LIMIT 10
    `);

    // Calculate utilization rates
    const totalCapacity = spotStats[0].total_capacity || 0;
    const occupiedSpots = totalCapacity - (spotStats[0].available_spots || 0);
    const utilizationRate = totalCapacity > 0 ? ((occupiedSpots / totalCapacity) * 100) : 0;

    // Calculate vehicle-specific utilization
    const carUtilization = spotStats[0].total_car_spots > 0 ? 
      (((spotStats[0].total_car_spots - spotStats[0].available_car_spots) / spotStats[0].total_car_spots) * 100) : 0;
    
    const bikeUtilization = spotStats[0].total_bike_spots > 0 ? 
      (((spotStats[0].total_bike_spots - spotStats[0].available_bike_spots) / spotStats[0].total_bike_spots) * 100) : 0;
    
    const truckUtilization = spotStats[0].total_truck_spots > 0 ? 
      (((spotStats[0].total_truck_spots - spotStats[0].available_truck_spots) / spotStats[0].total_truck_spots) * 100) : 0;

    // Get peak hour information
    const peakHour = hourlyTrends.reduce((max, current) => 
      current.bookings > max.bookings ? current : max, 
      { hour: 0, bookings: 0 }
    );

    const realTimeStats = {
      bookings: {
        total: bookingStats[0].total_bookings || 0,
        active: bookingStats[0].active_bookings || 0,
        pending: bookingStats[0].pending_bookings || 0,
        completed: bookingStats[0].completed_bookings || 0,
        cancelled: bookingStats[0].cancelled_bookings || 0,
        today: bookingStats[0].today_bookings || 0,
        last_hour: bookingStats[0].last_hour_bookings || 0,
        avg_duration: parseFloat(bookingStats[0].avg_duration || 0).toFixed(1)
      },
      availability: {
        total_spots: spotStats[0].total_spots || 0,
        total_capacity: spotStats[0].total_capacity || 0,
        available_spots: spotStats[0].available_spots || 0,
        occupied_spots: occupiedSpots,
        utilization_rate: parseFloat(utilizationRate).toFixed(1),
        car_spots: {
          total: spotStats[0].total_car_spots || 0,
          available: spotStats[0].available_car_spots || 0,
          utilization: parseFloat(carUtilization).toFixed(1)
        },
        bike_spots: {
          total: spotStats[0].total_bike_spots || 0,
          available: spotStats[0].available_bike_spots || 0,
          utilization: parseFloat(bikeUtilization).toFixed(1)
        },
        truck_spots: {
          total: spotStats[0].total_truck_spots || 0,
          available: spotStats[0].available_truck_spots || 0,
          utilization: parseFloat(truckUtilization).toFixed(1)
        }
      },
      revenue: {
        total: parseFloat(bookingStats[0].total_revenue || 0).toFixed(2),
        today: parseFloat(bookingStats[0].today_revenue || 0).toFixed(2),
        avg_per_booking: bookingStats[0].total_bookings > 0 ? 
          parseFloat((bookingStats[0].total_revenue || 0) / bookingStats[0].total_bookings).toFixed(2) : '0.00'
      },
      occupancy_by_vehicle: occupancyStats.map(stat => ({
        vehicle_type: stat.vehicle_type,
        active_bookings: stat.active_bookings,
        total_hours: stat.total_hours_booked
      })),
      trends: {
        hourly_today: hourlyTrends,
        peak_hour: peakHour.hour,
        peak_bookings: peakHour.bookings
      },
      recent_activity: recentBookings,
      system_health: {
        avg_rating: parseFloat(spotStats[0].avg_rating || 0).toFixed(1),
        satisfaction_rate: parseFloat(spotStats[0].avg_rating || 0) * 20, // Convert 5-star to percentage
        last_updated: new Date().toISOString()
      }
    };

    res.json({
      success: true,
      stats: realTimeStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching real-time stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      stats: {
        bookings: { total: 0, active: 0, available_spots: 0 },
        availability: { total_spots: 0, available_spots: 0 },
        revenue: { total: '0.00', today: '0.00' }
      }
    });
  }
});

// Get live booking updates (for real-time dashboard)
router.get('/live-updates', async (req, res) => {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();

    // Get bookings from last 5 minutes for live updates
    const [liveBookings] = await db.execute(`
      SELECT 
        b.id,
        b.booking_ref,
        b.vehicle_number,
        b.vehicle_type,
        b.status,
        b.total_price,
        b.created_at,
        ps.name as spot_name,
        u.name as user_name,
        'booking' as activity_type
      FROM bookings b
      LEFT JOIN parking_spots ps ON b.spot_id = ps.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      ORDER BY b.created_at DESC
    `);

    // Get recent status changes
    const [statusChanges] = await db.execute(`
      SELECT 
        b.id,
        b.booking_ref,
        b.status,
        b.updated_at,
        ps.name as spot_name,
        'status_change' as activity_type
      FROM bookings b
      LEFT JOIN parking_spots ps ON b.spot_id = ps.id
      WHERE b.updated_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        AND b.updated_at != b.created_at
      ORDER BY b.updated_at DESC
    `);

    // Get current system load
    const [systemLoad] = await db.execute(`
      SELECT 
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE) THEN 1 END) as requests_per_minute
      FROM bookings
    `);

    res.json({
      success: true,
      live_data: {
        recent_bookings: liveBookings,
        status_changes: statusChanges,
        system_load: systemLoad[0],
        active_users: liveBookings.length + statusChanges.length,
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching live updates:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get analytics data
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let dateFilter = '';
    switch (period) {
      case '24h':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 24 HOUR)';
        break;
      case '7d':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
      case '30d':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 30 DAY)';
        break;
      case '90d':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 90 DAY)';
        break;
      default:
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 7 DAY)';
    }

    // Booking trends
    const [bookingTrends] = await require('../config/database').getDatabase().query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as bookings,
        SUM(total_price) as revenue,
        AVG(duration) as avg_duration
      FROM bookings 
      WHERE created_at >= ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Popular spots
    const [popularSpots] = await require('../config/database').getDatabase().query(`
      SELECT 
        ps.name,
        ps.address,
        COUNT(b.id) as booking_count,
        SUM(b.total_price) as revenue,
        AVG(b.duration) as avg_duration
      FROM parking_spots ps
      LEFT JOIN bookings b ON ps.id = b.spot_id AND b.created_at >= ${dateFilter}
      GROUP BY ps.id, ps.name, ps.address
      ORDER BY booking_count DESC
      LIMIT 10
    `);

    // Peak hours
    const [peakHours] = await require('../config/database').getDatabase().query(`
      SELECT 
        HOUR(created_at) as hour,
        COUNT(*) as bookings
      FROM bookings 
      WHERE created_at >= ${dateFilter}
      GROUP BY HOUR(created_at)
      ORDER BY hour ASC
    `);

    res.json({
      success: true,
      analytics: {
        period,
        bookingTrends,
        popularSpots,
        peakHours
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

module.exports = router;