const express = require('express');
const User = require('../models/User');
const ParkingSpot = require('../models/ParkingSpot');
const Booking = require('../models/Booking');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireAdmin, requireSuperAdmin, logAdminActivity } = require('../middleware/adminMiddleware');
const emailService = require('../services/emailService');

const router = express.Router();

// Get admin dashboard stats
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get overall statistics
    const [userStats] = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'admin' OR role = 'super_admin' THEN 1 END) as admin_users,
        COUNT(CASE WHEN location_permission = TRUE THEN 1 END) as users_with_location,
        COUNT(CASE WHEN is_verified = TRUE THEN 1 END) as verified_users,
        COUNT(CASE WHEN is_active = TRUE OR is_active IS NULL THEN 1 END) as active_users
      FROM users
    `);
    
    const [bookingStats] = await db.query(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_bookings,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_bookings,
        COALESCE(SUM(total_price), 0) as total_revenue,
        COALESCE(AVG(duration), 0) as avg_duration
      FROM bookings
    `);
    
    const [spotStats] = await db.query(`
      SELECT 
        COUNT(*) as total_spots,
        COALESCE(SUM(total_spots), 0) as total_capacity,
        COALESCE(SUM(available_spots), 0) as available_capacity,
        COALESCE(AVG(price_per_hour), 0) as avg_price
      FROM parking_spots
    `);
    
    // Get recent location permission requests
    const [recentRequests] = await db.query(`
      SELECT lpr.*, u.name, u.email, u.phone, lpr.created_at as requested_at
      FROM location_permission_requests lpr
      JOIN users u ON lpr.user_id = u.id
      WHERE lpr.status = 'pending'
      ORDER BY lpr.created_at DESC
      LIMIT 10
    `);
    
    // Convert coordinates to numbers for proper frontend handling
    const processedRequests = recentRequests.map(request => ({
      ...request,
      current_latitude: request.current_latitude ? parseFloat(request.current_latitude) : null,
      current_longitude: request.current_longitude ? parseFloat(request.current_longitude) : null
    }));
    
    // Get recent admin activities (if table exists)
    let recentActivities = [];
    try {
      const [activities] = await db.query(`
        SELECT aal.*, u.name as admin_name
        FROM admin_activity_logs aal
        JOIN users u ON aal.admin_id = u.id
        ORDER BY aal.created_at DESC
        LIMIT 20
      `);
      recentActivities = activities;
    } catch (error) {
      console.log('Admin activity logs not available:', error.message);
    }
    
    // Add pending location requests count to user stats
    userStats[0].pending_location_requests = processedRequests.length;
    
    res.json({
      success: true,
      stats: {
        users: userStats[0],
        bookings: bookingStats[0],
        spots: spotStats[0]
      },
      pending_requests: processedRequests,
      recent_activities: recentActivities
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get location permission requests
router.get('/location-requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    const [requests] = await db.query(`
      SELECT 
        lpr.*,
        u.name, u.email, u.phone, u.created_at as user_created_at,
        admin.name as admin_name
      FROM location_permission_requests lpr
      JOIN users u ON lpr.user_id = u.id
      LEFT JOIN users admin ON lpr.admin_id = admin.id
      WHERE lpr.status = ?
      ORDER BY lpr.created_at DESC
      LIMIT ? OFFSET ?
    `, [status, parseInt(limit), parseInt(offset)]);
    
    // Convert coordinates to numbers for proper frontend handling
    const processedRequests = requests.map(request => ({
      ...request,
      current_latitude: request.current_latitude ? parseFloat(request.current_latitude) : null,
      current_longitude: request.current_longitude ? parseFloat(request.current_longitude) : null
    }));
    
    res.json({
      success: true,
      requests: processedRequests,
      count: processedRequests.length
    });
  } catch (error) {
    console.error('Location requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Process location permission request
router.post('/location-requests/:id/process', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes, createParkingSpot, placeName } = req.body; // action: 'approve' or 'deny'
    
    if (!['approve', 'deny'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Use "approve" or "deny"'
      });
    }
    
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get request details
    const [requests] = await db.query(`
      SELECT lpr.*, u.name, u.email 
      FROM location_permission_requests lpr
      JOIN users u ON lpr.user_id = u.id
      WHERE lpr.id = ? AND lpr.status = 'pending'
    `, [id]);
    
    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Request not found or already processed'
      });
    }
    
    const request = requests[0];
    const newStatus = action === 'approve' ? 'approved' : 'denied';
    
    // Update request status
    await db.query(`
      UPDATE location_permission_requests 
      SET status = ?, admin_id = ?, admin_response = ?
      WHERE id = ?
    `, [newStatus, req.admin.id, notes, id]);
    
    // Update user permission if approved
    if (action === 'approve') {
      await db.query(`
        UPDATE users 
        SET location_permission = TRUE, 
            location_permission_status = 'approved',
            admin_approved_by = ?,
            admin_approved_at = NOW()
        WHERE id = ?
      `, [req.admin.id, request.user_id]);
    } else {
      await db.query(`
        UPDATE users 
        SET location_permission_status = 'denied',
            admin_approved_by = ?,
            admin_approved_at = NOW()
        WHERE id = ?
      `, [req.admin.id, request.user_id]);
    }
    
    let createdSpotId = null;
    
    // Create parking spot if requested and approved
    if (action === 'approve' && createParkingSpot && placeName && request.current_latitude && request.current_longitude) {
      try {
        const spotData = {
          name: placeName.trim(),
          address: placeName.trim(),
          latitude: parseFloat(request.current_latitude),
          longitude: parseFloat(request.current_longitude),
          total_spots: 55, // 20 + 30 + 5
          available_spots: 55,
          car_spots: 20,
          available_car_spots: 20,
          bike_spots: 30,
          available_bike_spots: 30,
          truck_spots: 5,
          available_truck_spots: 5,
          price_per_hour: 20,
          car_price_per_hour: 20,
          bike_price_per_hour: 10,
          truck_price_per_hour: 50,
          features: JSON.stringify(['24/7 Access', 'Security Camera', 'Well Lit']),
          created_by_admin: req.admin.id,
          created_from_location_request: id
        };
        
        // Create parking spot
        const [spotResult] = await db.query(`
          INSERT INTO parking_spots (
            name, address, latitude, longitude, 
            total_spots, available_spots,
            car_spots, available_car_spots,
            bike_spots, available_bike_spots,
            truck_spots, available_truck_spots,
            price_per_hour, car_price_per_hour, bike_price_per_hour, truck_price_per_hour,
            features, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
          spotData.name, spotData.address, spotData.latitude, spotData.longitude,
          spotData.total_spots, spotData.available_spots,
          spotData.car_spots, spotData.available_car_spots,
          spotData.bike_spots, spotData.available_bike_spots,
          spotData.truck_spots, spotData.available_truck_spots,
          spotData.price_per_hour, spotData.car_price_per_hour, 
          spotData.bike_price_per_hour, spotData.truck_price_per_hour,
          spotData.features
        ]);
        
        createdSpotId = spotResult.insertId;
        
        // Log parking spot creation
        await logAdminActivity(
          req.admin.id,
          'parking_spot_create_from_location',
          'parking_spot',
          createdSpotId,
          { 
            spot_data: spotData, 
            location_request_id: id,
            user_id: request.user_id,
            place_name: placeName 
          },
          req
        );
        
        console.log(`✅ Created parking spot "${placeName}" (ID: ${createdSpotId}) from location request ${id}`);
      } catch (spotError) {
        console.error('Failed to create parking spot:', spotError);
        // Don't fail the entire request if spot creation fails
      }
    }
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'location_permission',
      'user',
      request.user_id,
      { 
        action, 
        request_id: id, 
        notes,
        parking_spot_created: !!createdSpotId,
        parking_spot_id: createdSpotId,
        place_name: placeName 
      },
      req
    );
    
    // Send email notification to user
    if (request.email) {
      try {
        const userData = {
          name: request.name,
          email: request.email
        };
        
        const notificationData = {
          admin_notes: notes,
          parking_spot_created: !!createdSpotId,
          place_name: placeName
        };
        
        let emailResult;
        if (action === 'approve') {
          emailResult = await emailService.sendLocationPermissionApprovalNotification(
            request.email,
            userData,
            notificationData
          );
          
          // Additional immediate notification for approved users
          if (emailResult.success) {
            console.log(`✅ INSTANT APPROVAL: Location permission approved for ${request.name} (${request.email})`);
            console.log(`   📧 Approval email sent with Message ID: ${emailResult.messageId || 'Test Mode'}`);
            console.log(`   🚀 User can now proceed with booking immediately`);
            if (createdSpotId) {
              console.log(`   🅿️ New parking spot "${placeName}" created (ID: ${createdSpotId})`);
            }
          }
        } else {
          emailResult = await emailService.sendLocationPermissionDenialNotification(
            request.email,
            userData,
            notificationData
          );
        }
        
        if (emailResult.success) {
          console.log(`✅ ${action === 'approve' ? 'Approval' : 'Denial'} notification sent to ${request.email}`);
        } else {
          console.error(`❌ Failed to send ${action} notification:`, emailResult.error);
        }
      } catch (emailError) {
        console.error(`❌ Error sending ${action} notification email:`, emailError.message);
        // Don't fail the entire request if email fails
      }
    }
    
    const responseData = {
      success: true,
      message: action === 'approve' && createdSpotId 
        ? `✅ Location permission APPROVED and parking spot "${placeName}" created! User can now proceed with booking.`
        : action === 'approve'
        ? `✅ Location permission APPROVED! User ${request.name} can now proceed with booking.`
        : `❌ Location permission DENIED for user ${request.name}.`,
      request: {
        id,
        status: newStatus,
        processed_by: req.admin.name,
        processed_at: new Date(),
        notes,
        user_name: request.name,
        user_email: request.email
      },
      instant_notification: action === 'approve' ? 'User will be automatically notified and can proceed immediately' : 'User has been notified of the decision'
    };
    
    if (createdSpotId) {
      responseData.parking_spot = {
        id: createdSpotId,
        name: placeName,
        latitude: request.current_latitude,
        longitude: request.current_longitude,
        message: `New parking spot "${placeName}" is now available for booking`
      };
    }
    
    res.json(responseData);
  } catch (error) {
    console.error('Process location request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Create parking spot (admin only with expiration support)
router.post('/parking-spots', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      name, address, latitude, longitude,
      total_spots, car_spots, bike_spots, truck_spots,
      price_per_hour, car_price_per_hour, bike_price_per_hour, truck_price_per_hour,
      features, expires_at
    } = req.body;
    
    // Validate required fields
    if (!name || !address || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Name, address, latitude, and longitude are required'
      });
    }
    
    const spotData = {
      name,
      address,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      total_spots: parseInt(total_spots) || 0,
      available_spots: parseInt(total_spots) || 0,
      car_spots: parseInt(car_spots) || 0,
      available_car_spots: parseInt(car_spots) || 0,
      bike_spots: parseInt(bike_spots) || 0,
      available_bike_spots: parseInt(bike_spots) || 0,
      truck_spots: parseInt(truck_spots) || 0,
      available_truck_spots: parseInt(truck_spots) || 0,
      price_per_hour: parseFloat(price_per_hour) || 0,
      car_price_per_hour: parseFloat(car_price_per_hour) || parseFloat(price_per_hour) || 0,
      bike_price_per_hour: parseFloat(bike_price_per_hour) || parseFloat(price_per_hour) || 0,
      truck_price_per_hour: parseFloat(truck_price_per_hour) || parseFloat(price_per_hour) || 0,
      features: features ? JSON.stringify(features) : null,
      admin_managed: true,
      created_by_admin: req.admin.id,
      expires_at: expires_at || null,
      is_expired: false
    };
    
    const spotId = await ParkingSpot.create(spotData);
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'parking_spot_create',
      'parking_spot',
      spotId,
      { spot_data: spotData, expires_at },
      req
    );
    
    // Log in admin parking management table
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    await db.query(`
      INSERT INTO admin_parking_management (admin_id, spot_id, action, new_data, reason)
      VALUES (?, ?, 'create', ?, ?)
    `, [
      req.admin.id,
      spotId,
      JSON.stringify(spotData),
      expires_at ? `Created with expiration: ${expires_at}` : 'Created without expiration'
    ]);
    
    res.status(201).json({
      success: true,
      message: expires_at ? 
        `Parking spot created successfully with expiration: ${expires_at}` :
        'Parking spot created successfully',
      spot_id: spotId,
      spot: spotData
    });
  } catch (error) {
    console.error('Create parking spot error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update parking spot (real-time)
router.put('/parking-spots/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const { reason } = req.body;
    
    // Get current spot data
    const currentSpot = await ParkingSpot.findById(id);
    if (!currentSpot) {
      return res.status(404).json({
        success: false,
        error: 'Parking spot not found'
      });
    }
    
    // Update the spot
    await currentSpot.update(updateData);
    
    // Log real-time update
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    await db.query(`
      INSERT INTO parking_real_time_updates 
      (spot_id, admin_id, update_type, old_value, new_value, reason)
      VALUES (?, ?, 'availability', ?, ?, ?)
    `, [
      id,
      req.admin.id,
      JSON.stringify(currentSpot.toJSON()),
      JSON.stringify(updateData),
      reason || 'Admin update'
    ]);
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'parking_spot_update',
      'parking_spot',
      id,
      { old_data: currentSpot.toJSON(), new_data: updateData, reason },
      req
    );
    
    res.json({
      success: true,
      message: 'Parking spot updated successfully',
      spot: currentSpot.toJSON()
    });
  } catch (error) {
    console.error('Update parking spot error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get all users (admin view)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      role, 
      location_permission, 
      search, 
      limit = 50, 
      offset = 0 
    } = req.query;
    
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    let query = `
      SELECT 
        id, name, email, phone, role, 
        location_permission, location_permission_status,
        current_latitude, current_longitude, location_updated_at,
        COALESCE(is_active, 1) as is_active, 
        is_verified, created_at, updated_at
      FROM users 
      WHERE 1=1
    `;
    const params = [];
    
    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }
    
    if (location_permission !== undefined) {
      query += ' AND location_permission = ?';
      params.push(location_permission === 'true');
    }
    
    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [users] = await db.query(query, params);
    
    // Convert coordinates to numbers and ensure proper data types
    const processedUsers = users.map(user => ({
      ...user,
      current_latitude: user.current_latitude ? parseFloat(user.current_latitude) : null,
      current_longitude: user.current_longitude ? parseFloat(user.current_longitude) : null,
      is_active: Boolean(user.is_active),
      is_verified: Boolean(user.is_verified),
      location_permission: Boolean(user.location_permission),
      location_permission_status: user.location_permission_status || 'none'
    }));
    
    res.json({
      success: true,
      users: processedUsers,
      count: processedUsers.length
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get all bookings (admin view)
router.get('/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      status, 
      user_id, 
      spot_id, 
      from_date, 
      to_date, 
      limit = 50, 
      offset = 0 
    } = req.query;
    
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    let query = `
      SELECT 
        b.*,
        u.name as user_name, u.email as user_email, u.phone as user_phone,
        ps.name as spot_name, ps.address as spot_address
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN parking_spots ps ON b.spot_id = ps.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }
    
    if (user_id) {
      query += ' AND b.user_id = ?';
      params.push(user_id);
    }
    
    if (spot_id) {
      query += ' AND b.spot_id = ?';
      params.push(spot_id);
    }
    
    if (from_date) {
      query += ' AND DATE(b.created_at) >= ?';
      params.push(from_date);
    }
    
    if (to_date) {
      query += ' AND DATE(b.created_at) <= ?';
      params.push(to_date);
    }
    
    query += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [bookings] = await db.query(query, params);
    
    // Process bookings to ensure proper data format
    const processedBookings = bookings.map(booking => ({
      ...booking,
      total_price: parseFloat(booking.total_price || 0),
      duration: parseFloat(booking.duration || 0),
      booking_date: booking.booking_date || new Date(booking.created_at).toISOString().split('T')[0],
      start_time: booking.start_time || 'N/A',
      end_time: booking.end_time || 'N/A',
      vehicle_type: booking.vehicle_type || 'car',
      vehicle_number: booking.vehicle_number || 'N/A'
    }));
    
    res.json({
      success: true,
      bookings: processedBookings,
      count: processedBookings.length
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update user role (super admin only)
router.put('/users/:id/role', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['user', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Use: user, admin, super_admin'
      });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    await user.update({ role });
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'user_management',
      'user',
      id,
      { action: 'role_change', old_role: user.role, new_role: role },
      req
    );
    
    res.json({
      success: true,
      message: 'User role updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Create new user (admin only)
router.post('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, password, role = 'user', is_active = true } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }
    
    // Create user
    const userId = await User.create({
      name,
      email,
      password,
      phone,
      role,
      is_verified: true, // Admin-created users are auto-verified
      email_verified_at: new Date()
    });
    
    // Get user data
    const user = await User.findById(userId);
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'user_create',
      'user',
      userId,
      { user_data: { name, email, phone, role } },
      req
    );
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update user (admin only)
router.put('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, role, is_active, password } = req.body;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (role) updateData.role = role;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    // Update password if provided
    if (password) {
      await user.changePassword(password);
    }
    
    // Update other fields
    if (Object.keys(updateData).length > 0) {
      await user.update(updateData);
    }
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'user_update',
      'user',
      id,
      { old_data: user.toJSON(), new_data: updateData },
      req
    );
    
    res.json({
      success: true,
      message: 'User updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update user status (admin only)
router.put('/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    await user.update({ is_active });
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'user_status_change',
      'user',
      id,
      { action: is_active ? 'activate' : 'deactivate' },
      req
    );
    
    res.json({
      success: true,
      message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Delete user (admin only)
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Prevent deleting super admin
    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete super admin user'
      });
    }
    
    await user.delete();
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'user_delete',
      'user',
      id,
      { deleted_user: user.toJSON() },
      req
    );
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update parking spot status (admin only)
router.put('/parking-spots/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    const spot = await ParkingSpot.findById(id);
    if (!spot) {
      return res.status(404).json({
        success: false,
        error: 'Parking spot not found'
      });
    }
    
    await spot.update({ is_active });
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'parking_spot_status_change',
      'parking_spot',
      id,
      { action: is_active ? 'activate' : 'deactivate' },
      req
    );
    
    res.json({
      success: true,
      message: `Parking spot ${is_active ? 'activated' : 'deactivated'} successfully`,
      spot: spot.toJSON()
    });
  } catch (error) {
    console.error('Update parking spot status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Delete parking spot (admin only)
router.delete('/parking-spots/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const spot = await ParkingSpot.findById(id);
    if (!spot) {
      return res.status(404).json({
        success: false,
        error: 'Parking spot not found'
      });
    }
    
    // Check for active bookings
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    const [activeBookings] = await db.query(
      'SELECT COUNT(*) as count FROM bookings WHERE spot_id = ? AND status = "active"',
      [id]
    );
    
    if (activeBookings[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete parking spot with active bookings'
      });
    }
    
    await spot.delete();
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'parking_spot_delete',
      'parking_spot',
      id,
      { deleted_spot: spot.toJSON() },
      req
    );
    
    res.json({
      success: true,
      message: 'Parking spot deleted successfully'
    });
  } catch (error) {
    console.error('Delete parking spot error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Extend booking (admin only)
router.post('/bookings/:id/extend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { additional_hours, admin_reason } = req.body;
    
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    if (booking.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Can only extend active bookings'
      });
    }
    
    // Calculate new end time and price
    const newDuration = booking.duration + parseFloat(additional_hours);
    const additionalPrice = parseFloat(additional_hours) * booking.price_per_hour;
    const newTotalPrice = booking.total_price + additionalPrice;
    
    // Update booking
    await booking.update({
      duration: newDuration,
      total_price: newTotalPrice,
      admin_extended: true,
      admin_extension_reason: admin_reason
    });
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'booking_extend',
      'booking',
      id,
      { 
        additional_hours: parseFloat(additional_hours),
        additional_price: additionalPrice,
        admin_reason 
      },
      req
    );
    
    res.json({
      success: true,
      message: `Booking extended by ${additional_hours} hours`,
      booking: booking.toJSON()
    });
  } catch (error) {
    console.error('Extend booking error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Cancel booking (admin only)
router.post('/bookings/:id/cancel', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_reason } = req.body;
    
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    if (booking.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Can only cancel active bookings'
      });
    }
    
    // Update booking status
    await booking.update({
      status: 'cancelled',
      admin_cancelled: true,
      admin_cancellation_reason: admin_reason,
      cancelled_at: new Date()
    });
    
    // Free up the parking spot
    const spot = await ParkingSpot.findById(booking.spot_id);
    if (spot) {
      const updateData = { available_spots: spot.available_spots + 1 };
      
      // Update vehicle-specific availability
      if (booking.vehicle_type === 'car') {
        updateData.available_car_spots = (spot.available_car_spots || 0) + 1;
      } else if (booking.vehicle_type === 'bike') {
        updateData.available_bike_spots = (spot.available_bike_spots || 0) + 1;
      } else if (booking.vehicle_type === 'truck') {
        updateData.available_truck_spots = (spot.available_truck_spots || 0) + 1;
      }
      
      await spot.update(updateData);
    }
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'booking_cancel',
      'booking',
      id,
      { admin_reason },
      req
    );
    
    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking: booking.toJSON()
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Delete booking (admin only) - for expired bookings cleanup
router.delete('/bookings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_reason } = req.body;
    
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get booking details before deletion
    const [bookings] = await db.query(`
      SELECT b.*, u.name as user_name, u.email as user_email, ps.name as spot_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN parking_spots ps ON b.spot_id = ps.id
      WHERE b.id = ?
    `, [id]);
    
    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    const booking = bookings[0];
    
    // Only allow deletion of expired or cancelled bookings
    if (!['expired', 'cancelled', 'completed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        error: 'Can only delete expired, cancelled, or completed bookings'
      });
    }
    
    // Delete the booking from database
    await db.query('DELETE FROM bookings WHERE id = ?', [id]);
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'booking_delete',
      'booking',
      id,
      { 
        deleted_booking: booking,
        admin_reason: admin_reason || 'Expired booking cleanup'
      },
      req
    );
    
    res.json({
      success: true,
      message: 'Booking deleted successfully',
      deleted_booking: {
        id: booking.id,
        booking_ref: booking.booking_ref,
        user_name: booking.user_name,
        spot_name: booking.spot_name,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Export bookings (admin only)
router.get('/bookings/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { from_date, to_date, status } = req.query;
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    let query = `
      SELECT 
        b.booking_ref, b.status, b.booking_date, b.start_time, b.end_time,
        b.duration, b.total_price, b.vehicle_type, b.vehicle_number,
        u.name as user_name, u.email as user_email, u.phone as user_phone,
        ps.name as spot_name, ps.address as spot_address,
        b.created_at
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN parking_spots ps ON b.spot_id = ps.id
      WHERE 1=1
    `;
    const params = [];
    
    if (from_date) {
      query += ' AND DATE(b.created_at) >= ?';
      params.push(from_date);
    }
    
    if (to_date) {
      query += ' AND DATE(b.created_at) <= ?';
      params.push(to_date);
    }
    
    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY b.created_at DESC';
    
    const [bookings] = await db.query(query, params);
    
    // Convert to CSV
    const csvHeaders = [
      'Booking Ref', 'Status', 'Date', 'Start Time', 'End Time', 'Duration (hrs)',
      'Amount (₹)', 'Vehicle Type', 'Vehicle Number', 'User Name', 'User Email',
      'User Phone', 'Spot Name', 'Spot Address', 'Created At'
    ];
    
    const csvRows = bookings.map(booking => [
      booking.booking_ref,
      booking.status,
      booking.booking_date,
      booking.start_time,
      booking.end_time,
      booking.duration,
      booking.total_price,
      booking.vehicle_type,
      booking.vehicle_number,
      booking.user_name,
      booking.user_email,
      booking.user_phone || '',
      booking.spot_name,
      booking.spot_address,
      new Date(booking.created_at).toLocaleString()
    ]);
    
    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings-export.csv"');
    res.send(csvContent);
    
    // Log admin activity
    await logAdminActivity(
      req.admin.id,
      'bookings_export',
      'system',
      null,
      { export_params: { from_date, to_date, status }, record_count: bookings.length },
      req
    );
  } catch (error) {
    console.error('Export bookings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get admin activity logs
router.get('/activity-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      admin_id, 
      action_type, 
      target_type, 
      limit = 100, 
      offset = 0 
    } = req.query;
    
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    let query = `
      SELECT 
        aal.*,
        u.name as admin_name, u.email as admin_email
      FROM admin_activity_logs aal
      JOIN users u ON aal.admin_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (admin_id) {
      query += ' AND aal.admin_id = ?';
      params.push(admin_id);
    }
    
    if (action_type) {
      query += ' AND aal.action_type = ?';
      params.push(action_type);
    }
    
    if (target_type) {
      query += ' AND aal.target_type = ?';
      params.push(target_type);
    }
    
    query += ' ORDER BY aal.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [logs] = await db.query(query, params);
    
    res.json({
      success: true,
      logs,
      count: logs.length
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get expired parking spots (admin only)
router.get('/parking-spots/expired', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    const [expiredSpots] = await db.query(`
      SELECT 
        ps.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM parking_spots ps
      LEFT JOIN users u ON ps.created_by_admin = u.id
      WHERE ps.is_expired = TRUE OR (ps.expires_at IS NOT NULL AND ps.expires_at < NOW())
      ORDER BY ps.expires_at DESC
    `);
    
    res.json({
      success: true,
      expired_spots: expiredSpots,
      count: expiredSpots.length
    });
  } catch (error) {
    console.error('Get expired spots error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Mark parking spot as expired (admin only)
router.post('/parking-spots/:id/expire', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get current spot data
    const [spots] = await db.query('SELECT * FROM parking_spots WHERE id = ?', [id]);
    
    if (spots.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Parking spot not found'
      });
    }
    
    const spot = spots[0];
    
    // Mark as expired
    await db.query(`
      UPDATE parking_spots 
      SET is_expired = TRUE, expires_at = NOW()
      WHERE id = ?
    `, [id]);
    
    // Log admin activity
    await db.query(`
      INSERT INTO admin_parking_management (admin_id, spot_id, action, old_data, reason)
      VALUES (?, ?, 'expire', ?, ?)
    `, [
      req.admin.id,
      id,
      JSON.stringify(spot),
      reason || 'Manually expired by admin'
    ]);
    
    await logAdminActivity(
      req.admin.id,
      'parking_spot_expire',
      'parking_spot',
      id,
      { reason, expired_at: new Date() },
      req
    );
    
    res.json({
      success: true,
      message: 'Parking spot marked as expired successfully',
      spot_id: id
    });
  } catch (error) {
    console.error('Expire parking spot error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Renew expired parking spot (admin only)
router.post('/parking-spots/:id/renew', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { expires_at, reason } = req.body;
    
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get current spot data
    const [spots] = await db.query('SELECT * FROM parking_spots WHERE id = ?', [id]);
    
    if (spots.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Parking spot not found'
      });
    }
    
    const spot = spots[0];
    
    // Renew the spot
    await db.query(`
      UPDATE parking_spots 
      SET is_expired = FALSE, expires_at = ?
      WHERE id = ?
    `, [expires_at || null, id]);
    
    // Log admin activity
    await db.query(`
      INSERT INTO admin_parking_management (admin_id, spot_id, action, old_data, new_data, reason)
      VALUES (?, ?, 'activate', ?, ?, ?)
    `, [
      req.admin.id,
      id,
      JSON.stringify(spot),
      JSON.stringify({ expires_at, is_expired: false }),
      reason || 'Renewed by admin'
    ]);
    
    await logAdminActivity(
      req.admin.id,
      'parking_spot_renew',
      'parking_spot',
      id,
      { reason, new_expires_at: expires_at },
      req
    );
    
    res.json({
      success: true,
      message: expires_at ? 
        `Parking spot renewed successfully until ${expires_at}` :
        'Parking spot renewed successfully (no expiration)',
      spot_id: id
    });
  } catch (error) {
    console.error('Renew parking spot error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Run expiration cleanup (admin only)
router.post('/parking-spots/cleanup-expired', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Mark expired spots
    const [expiredResult] = await db.query(`
      UPDATE parking_spots 
      SET is_expired = TRUE 
      WHERE expires_at IS NOT NULL 
      AND expires_at < NOW() 
      AND is_expired = FALSE
    `);
    
    // Get newly expired spots
    const [expiredSpots] = await db.query(`
      SELECT id, name, expires_at 
      FROM parking_spots 
      WHERE is_expired = TRUE 
      AND expires_at < NOW()
    `);
    
    // Log expired spots
    for (const spot of expiredSpots) {
      await db.query(`
        INSERT INTO admin_parking_management (admin_id, spot_id, action, reason)
        VALUES (?, ?, 'expire', ?)
      `, [
        req.admin.id,
        spot.id,
        `Automatically expired at ${spot.expires_at}`
      ]);
    }
    
    await logAdminActivity(
      req.admin.id,
      'parking_spots_cleanup',
      'system',
      null,
      { expired_count: expiredResult.affectedRows, expired_spots: expiredSpots },
      req
    );
    
    res.json({
      success: true,
      message: `Cleanup completed. ${expiredResult.affectedRows} spots marked as expired.`,
      expired_count: expiredResult.affectedRows,
      expired_spots: expiredSpots
    });
  } catch (error) {
    console.error('Cleanup expired spots error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get parking management history (admin only)
router.get('/parking-management/history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { spot_id, action, limit = 50, offset = 0 } = req.query;
    
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    let query = `
      SELECT 
        apm.*,
        u.name as admin_name,
        ps.name as spot_name
      FROM admin_parking_management apm
      JOIN users u ON apm.admin_id = u.id
      LEFT JOIN parking_spots ps ON apm.spot_id = ps.id
      WHERE 1=1
    `;
    const params = [];
    
    if (spot_id) {
      query += ' AND apm.spot_id = ?';
      params.push(spot_id);
    }
    
    if (action) {
      query += ' AND apm.action = ?';
      params.push(action);
    }
    
    query += ' ORDER BY apm.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [history] = await db.query(query, params);
    
    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('Get parking management history error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;