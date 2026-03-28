const express = require('express');
const User = require('../models/User');
const ParkingSpot = require('../models/ParkingSpot');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Update user location
router.post('/update', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, permission } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update location
    await user.updateLocation(latitude, longitude);
    
    // Update permission if provided
    if (typeof permission === 'boolean') {
      await user.setLocationPermission(permission);
    }

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: {
        latitude: user.current_latitude,
        longitude: user.current_longitude,
        updated_at: user.location_updated_at,
        permission: user.location_permission
      }
    });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get user's current location
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      location: {
        latitude: user.current_latitude,
        longitude: user.current_longitude,
        updated_at: user.location_updated_at,
        permission: user.location_permission,
        is_recent: user.isLocationRecent()
      }
    });
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get nearby parking spots (with automatic parking spot creation)
router.get('/nearby-spots', authenticateToken, async (req, res) => {
  try {
    const { radius = 5, limit = 10 } = req.query;
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.current_latitude || !user.current_longitude) {
      return res.status(400).json({
        success: false,
        error: 'User location not available. Please enable location services.'
      });
    }

    if (!user.isLocationRecent()) {
      return res.status(400).json({
        success: false,
        error: 'Location data is outdated. Please refresh your location.'
      });
    }

    // AUTOMATIC PARKING SPOT CREATION DISABLED - Only Belagavi parking allowed
    // await autoCreateParkingSpotAtUserLocation(user, req);

    const nearbySpots = await user.getNearbyParkingSpots(
      parseFloat(radius), 
      parseInt(limit)
    );

    res.json({
      success: true,
      spots: nearbySpots,
      user_location: {
        latitude: user.current_latitude,
        longitude: user.current_longitude
      },
      search_radius: parseFloat(radius),
      count: nearbySpots.length
    });
  } catch (error) {
    console.error('Nearby spots error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Function to automatically create parking spot at user's location when they search
async function autoCreateParkingSpotAtUserLocation(user, req) {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    const latitude = user.current_latitude;
    const longitude = user.current_longitude;
    
    // Check if parking spot already exists at this location (within 200 meters)
    const [existingSpots] = await db.query(`
      SELECT id, name, latitude, longitude,
        (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians(?)) + sin(radians(?)) * 
        sin(radians(latitude)))) AS distance
      FROM parking_spots 
      HAVING distance < 0.2
      ORDER BY distance
      LIMIT 1
    `, [latitude, longitude, latitude]);
    
    if (existingSpots.length > 0) {
      console.log(`⚠️ Parking spot already exists within 200m: ${existingSpots[0].name}`);
      return existingSpots[0].id;
    }
    
    // Generate place name based on coordinates
    const placeName = `Parking Hub ${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    
    const spotData = {
      name: placeName,
      address: placeName,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
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
      features: JSON.stringify(['24/7 Access', 'Security Camera', 'Well Lit', 'Auto-Created on Search']),
      created_by_user: user.id,
      auto_created_on_search: true
    };
    
    // Create new parking spot
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
    
    const createdSpotId = spotResult.insertId;
    
    console.log(`✅ Auto-created parking spot "${placeName}" (ID: ${createdSpotId}) when user searched for nearby spots`);
    
    // Log the auto-creation activity
    await db.query(`
      INSERT INTO admin_activity_logs 
      (admin_id, action_type, target_type, target_id, details, ip_address, user_agent)
      VALUES (?, 'auto_parking_spot_create_on_search', 'parking_spot', ?, ?, ?, ?)
    `, [
      user.id, // User who triggered the creation by searching
      createdSpotId,
      JSON.stringify({ 
        spot_data: spotData, 
        user_id: user.id,
        place_name: placeName,
        auto_created_on_search: true,
        reason: 'Auto-created when user searched for nearby parking spots'
      }),
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent') || 'Unknown'
    ]);
    
    // Send notification to admins about the auto-creation
    await notifyAdminsOfSearchAutoCreation(user, createdSpotId, spotData, {
      latitude: latitude,
      longitude: longitude,
      reason: 'Auto-created when user searched for nearby parking spots'
    });
    
    return createdSpotId;
    
  } catch (error) {
    console.error('Failed to auto-create parking spot on search:', error);
    // Don't fail the search if spot creation fails
    return null;
  }
}

// Function to notify all admins of auto-created parking spot during search
async function notifyAdminsOfSearchAutoCreation(user, spotId, spotData, locationData) {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get all admin users
    const [admins] = await db.query(`
      SELECT id, name, email FROM users 
      WHERE role IN ('admin', 'super_admin') AND is_active = TRUE
    `);
    
    for (const admin of admins) {
      try {
        // Create admin notification in database
        await db.query(`
          INSERT INTO notifications (user_id, type, title, message, metadata)
          VALUES (?, 'admin_alert', 'Auto-Created Parking Spot (Search)', ?, ?)
        `, [
          admin.id,
          `${user.name} searched for parking and spot "${spotData?.name || 'Unknown'}" was auto-created at their location`,
          JSON.stringify({
            type: 'auto_parking_spot_creation_on_search',
            user_id: user.id,
            user_name: user.name,
            user_email: user.email,
            spot_id: spotId,
            spot_name: spotData?.name,
            location: locationData,
            timestamp: new Date().toISOString()
          })
        ]);
        
        console.log(`📧 Admin notification sent to ${admin.name} about search auto-created parking spot`);
      } catch (error) {
        console.error(`Failed to notify admin ${admin.name}:`, error);
      }
    }
    
    console.log(`✅ Notified ${admins.length} admins of search auto-created parking spot by ${user.name}`);
  } catch (error) {
    console.error('Failed to notify admins of search auto-creation:', error);
  }
}

// Set location permission with automatic parking spot creation
router.post('/permission-auto-create', authenticateToken, async (req, res) => {
  try {
    const { permission, reason, latitude, longitude, placeName } = req.body;

    if (typeof permission !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Permission must be true or false'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (permission) {
      // Update user location immediately
      if (latitude && longitude) {
        await user.updateLocation(latitude, longitude);
      }

      // Grant location permission immediately (no admin approval needed)
      const { getDatabase } = require('../config/database');
      const db = getDatabase();
      
      await db.query(`
        UPDATE users 
        SET location_permission = TRUE, 
            location_permission_status = 'approved',
            admin_approved_by = NULL,
            admin_approved_at = NOW()
        WHERE id = ?
      `, [req.user.userId]);
      
      let createdSpotId = null;
      let spotData = null;
      
      // Automatically create parking spot at user's location
      if (latitude && longitude) {
        try {
          const finalPlaceName = placeName || `Parking Spot ${latitude.toFixed(4)},${longitude.toFixed(4)}`;
          
          spotData = {
            name: finalPlaceName,
            address: finalPlaceName,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
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
            features: JSON.stringify(['24/7 Access', 'Security Camera', 'Well Lit', 'Auto-Created']),
            created_by_user: req.user.userId,
            auto_created: true
          };
          
          // Check if parking spot already exists at this location (within 100 meters)
          const [existingSpots] = await db.query(`
            SELECT id, name, latitude, longitude,
              (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * 
              cos(radians(longitude) - radians(?)) + sin(radians(?)) * 
              sin(radians(latitude)))) AS distance
            FROM parking_spots 
            HAVING distance < 0.1
            ORDER BY distance
            LIMIT 1
          `, [latitude, longitude, latitude]);
          
          if (existingSpots.length > 0) {
            console.log(`⚠️ Parking spot already exists within 100m: ${existingSpots[0].name}`);
            createdSpotId = existingSpots[0].id;
            spotData = existingSpots[0];
          } else {
            // Create new parking spot
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
            spotData.id = createdSpotId;
            
            console.log(`✅ Auto-created parking spot "${finalPlaceName}" (ID: ${createdSpotId}) at user location`);
          }
          
          // Log the auto-creation activity
          await db.query(`
            INSERT INTO admin_activity_logs 
            (admin_id, action_type, target_type, target_id, details, ip_address, user_agent)
            VALUES (?, 'auto_parking_spot_create', 'parking_spot', ?, ?, ?, ?)
          `, [
            req.user.userId, // User who triggered the creation
            createdSpotId,
            JSON.stringify({ 
              spot_data: spotData, 
              user_id: req.user.userId,
              place_name: finalPlaceName,
              auto_created: true,
              reason: reason || 'Auto-created from location permission'
            }),
            req.ip || req.connection.remoteAddress,
            req.get('User-Agent') || 'Unknown'
          ]);
          
        } catch (spotError) {
          console.error('Failed to create parking spot:', spotError);
          // Don't fail the entire request if spot creation fails
        }
      }
      
      // Send notification to admins about the auto-creation
      await notifyAdminsOfAutoCreation(user, createdSpotId, spotData, {
        latitude: latitude,
        longitude: longitude,
        reason: reason || 'User granted location permission - auto-created parking spot'
      });
      
      const responseData = {
        success: true,
        message: 'Location permission granted successfully!',
        permission: true,
        location: {
          latitude: user.current_latitude || latitude,
          longitude: user.current_longitude || longitude
        }
      };
      
      if (createdSpotId && spotData) {
        responseData.parking_spot_created = true;
        responseData.parking_spot = {
          id: createdSpotId,
          name: spotData.name,
          latitude: spotData.latitude,
          longitude: spotData.longitude,
          total_spots: spotData.total_spots,
          car_spots: spotData.car_spots,
          bike_spots: spotData.bike_spots,
          truck_spots: spotData.truck_spots
        };
      }
      
      res.json(responseData);
    } else {
      // User is revoking permission
      await user.setLocationPermission(false);
      
      res.json({
        success: true,
        message: 'Location permission revoked',
        permission: false
      });
    }
  } catch (error) {
    console.error('Auto permission request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Function to notify all admins of auto-created parking spot
async function notifyAdminsOfAutoCreation(user, spotId, spotData, locationData) {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get all admin users
    const [admins] = await db.query(`
      SELECT id, name, email FROM users 
      WHERE role IN ('admin', 'super_admin') AND is_active = TRUE
    `);
    
    // Send email notification to each admin
    const emailService = require('../services/emailService');
    
    for (const admin of admins) {
      try {
        // Create admin notification in database
        await db.query(`
          INSERT INTO notifications (user_id, type, title, message, metadata)
          VALUES (?, 'admin_alert', 'Auto-Created Parking Spot', ?, ?)
        `, [
          admin.id,
          `${user.name} granted location permission and parking spot "${spotData?.name || 'Unknown'}" was auto-created`,
          JSON.stringify({
            type: 'auto_parking_spot_creation',
            user_id: user.id,
            user_name: user.name,
            user_email: user.email,
            spot_id: spotId,
            spot_name: spotData?.name,
            location: locationData,
            timestamp: new Date().toISOString()
          })
        ]);
        
        console.log(`📧 Admin notification sent to ${admin.name} about auto-created parking spot`);
      } catch (error) {
        console.error(`Failed to notify admin ${admin.name}:`, error);
      }
    }
    
    console.log(`✅ Notified ${admins.length} admins of auto-created parking spot by ${user.name}`);
  } catch (error) {
    console.error('Failed to notify admins of auto-creation:', error);
  }
}
router.post('/permission', authenticateToken, async (req, res) => {
  try {
    const { permission, reason } = req.body;

    if (typeof permission !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Permission must be true or false'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (permission) {
      // Get current location first
      const { latitude, longitude } = req.body;
      
      if (latitude && longitude) {
        // Update user location immediately
        await user.updateLocation(latitude, longitude);
      }

      // Create location permission request
      const { getDatabase } = require('../config/database');
      const db = getDatabase();
      
      // Check if there's already a pending request
      const [existingRequests] = await db.query(`
        SELECT id FROM location_permission_requests 
        WHERE user_id = ? AND status = 'pending'
      `, [req.user.userId]);
      
      if (existingRequests.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'You already have a pending location permission request'
        });
      }
      
      // Get device info
      const deviceInfo = {
        user_agent: req.get('User-Agent'),
        ip_address: req.ip || req.connection.remoteAddress,
        timestamp: new Date().toISOString(),
        browser: req.get('User-Agent')?.split(' ')[0] || 'Unknown',
        platform: req.get('sec-ch-ua-platform') || 'Unknown'
      };
      
      // Create permission request with current location
      const [requestResult] = await db.query(`
        INSERT INTO location_permission_requests 
        (user_id, request_reason, current_latitude, current_longitude, device_info)
        VALUES (?, ?, ?, ?, ?)
      `, [
        req.user.userId,
        reason || 'User requested location access for booking features',
        user.current_latitude || latitude,
        user.current_longitude || longitude,
        JSON.stringify(deviceInfo)
      ]);
      
      const requestId = requestResult.insertId;
      
      // Update user status to pending
      await db.query(`
        UPDATE users 
        SET location_permission_status = 'pending', location_requested_at = NOW()
        WHERE id = ?
      `, [req.user.userId]);
      
      // Send real-time notification to all admins
      await notifyAdminsOfLocationRequest(user, requestId, {
        latitude: user.current_latitude || latitude,
        longitude: user.current_longitude || longitude,
        deviceInfo,
        reason: reason || 'User requested location access for booking features'
      });
      
      // Emit real-time notification to connected admins
      if (global.emitAdminNotification) {
        global.emitAdminNotification({
          user_id: user.id,
          user_name: user.name,
          user_email: user.email,
          user_phone: user.phone,
          request_id: requestId,
          latitude: user.current_latitude || latitude,
          longitude: user.current_longitude || longitude,
          reason: reason || 'User requested location access for booking features',
          device_info: deviceInfo,
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        message: 'Location permission request submitted. Admin has been notified immediately.',
        status: 'pending',
        request_id: requestId,
        location: {
          latitude: user.current_latitude || latitude,
          longitude: user.current_longitude || longitude
        }
      });
    } else {
      // User is revoking permission
      await user.setLocationPermission(false);
      
      res.json({
        success: true,
        message: 'Location permission revoked',
        permission: false
      });
    }
  } catch (error) {
    console.error('Permission request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Function to notify all admins of new location request
async function notifyAdminsOfLocationRequest(user, requestId, locationData) {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get all admin users
    const [admins] = await db.query(`
      SELECT id, name, email FROM users 
      WHERE role IN ('admin', 'super_admin') AND is_active = TRUE
    `);
    
    // Send email notification to each admin
    const emailService = require('../services/emailService');
    
    for (const admin of admins) {
      try {
        // Create admin notification in database
        await db.query(`
          INSERT INTO notifications (user_id, type, title, message, metadata)
          VALUES (?, 'admin_alert', 'New Location Permission Request', ?, ?)
        `, [
          admin.id,
          `${user.name} has requested location permission`,
          JSON.stringify({
            type: 'location_permission_request',
            user_id: user.id,
            user_name: user.name,
            user_email: user.email,
            request_id: requestId,
            location: locationData,
            timestamp: new Date().toISOString()
          })
        ]);
        
        // Send email notification to admin
        if (admin.email) {
          await sendAdminLocationRequestEmail(admin, user, locationData, requestId);
        }
        
        console.log(`📧 Admin notification sent to ${admin.name} (${admin.email})`);
      } catch (error) {
        console.error(`Failed to notify admin ${admin.name}:`, error);
      }
    }
    
    console.log(`✅ Notified ${admins.length} admins of location request from ${user.name}`);
  } catch (error) {
    console.error('Failed to notify admins:', error);
  }
}

// Function to send email to admin about location request
async function sendAdminLocationRequestEmail(admin, user, locationData, requestId) {
  try {
    const emailService = require('../services/emailService');
    
    // Use the new email service method
    const result = await emailService.sendLocationPermissionRequestEmail(
      admin.email,
      {
        name: user.name,
        email: user.email,
        phone: user.phone
      },
      locationData,
      requestId
    );
    
    if (result.success) {
      console.log(`✅ Admin email notification sent to ${admin.email}`);
      if (result.testMode) {
        console.log('📧 Location permission request email logged in test mode');
      } else {
        console.log(`📬 Real email sent with Message ID: ${result.messageId}`);
      }
    } else {
      console.log(`❌ Failed to send admin email to ${admin.email}:`, result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to send admin email:', error);
    return { success: false, error: error.message };
  }
}

// Search city and automatically create parking spots
router.post('/search-city', authenticateToken, async (req, res) => {
  try {
    const { cityName } = req.body;
    
    if (!cityName || !cityName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'City name is required'
      });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get city coordinates (predefined major cities)
    const cityCoordinates = getCityCoordinates(cityName.trim());
    
    if (!cityCoordinates) {
      return res.status(400).json({
        success: false,
        error: `City "${cityName}" not found. Please try major cities like Delhi, Mumbai, Bangalore, Chennai, Kolkata, Hyderabad, Pune, Ahmedabad, Jaipur, Lucknow, Belagavi.`
      });
    }
    
    // Check existing parking spots in the city (within 10km radius)
    const [existingSpots] = await db.query(`
      SELECT id, name, address, latitude, longitude, total_spots, available_spots,
        car_spots, available_car_spots, bike_spots, available_bike_spots, 
        truck_spots, available_truck_spots, car_price_per_hour, bike_price_per_hour, truck_price_per_hour,
        (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians(?)) + sin(radians(?)) * 
        sin(radians(latitude)))) AS distance_km
      FROM parking_spots 
      HAVING distance_km <= 10
      ORDER BY distance_km
      LIMIT 20
    `, [cityCoordinates.latitude, cityCoordinates.longitude, cityCoordinates.latitude]);
    
    let spotsCreated = 0;
    
    // If no spots exist, create multiple parking spots across the city
    if (existingSpots.length === 0) {
      const cityParkingSpots = generateCityParkingSpots(cityName, cityCoordinates);
      
      for (const spotData of cityParkingSpots) {
        try {
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
          
          spotsCreated++;
          
          console.log(`✅ Created parking spot "${spotData.name}" in ${cityName}`);
          
        } catch (spotError) {
          console.error(`Failed to create parking spot ${spotData.name}:`, spotError);
        }
      }
      
      // Log the city search and creation activity
      await db.query(`
        INSERT INTO admin_activity_logs 
        (admin_id, action_type, target_type, target_id, details, ip_address, user_agent)
        VALUES (?, 'city_parking_spots_create', 'city', ?, ?, ?, ?)
      `, [
        user.id,
        0, // No specific target ID for city creation
        JSON.stringify({ 
          city_name: cityName,
          spots_created: spotsCreated,
          city_coordinates: cityCoordinates,
          user_id: user.id,
          reason: `Auto-created parking spots for city search: ${cityName}`
        }),
        req.ip || req.connection.remoteAddress,
        req.get('User-Agent') || 'Unknown'
      ]);
      
      // Send notification to admins about city parking creation
      await notifyAdminsOfCityCreation(user, cityName, spotsCreated, cityCoordinates);
    }
    
    // Get all spots in the city (including newly created ones)
    const [allCitySpots] = await db.query(`
      SELECT id, name, address, latitude, longitude, total_spots, available_spots,
        car_spots, available_car_spots, bike_spots, available_bike_spots, 
        truck_spots, available_truck_spots, car_price_per_hour, bike_price_per_hour, truck_price_per_hour,
        (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians(?)) + sin(radians(?)) * 
        sin(radians(latitude)))) AS distance_km
      FROM parking_spots 
      HAVING distance_km <= 10
      ORDER BY distance_km
      LIMIT 20
    `, [cityCoordinates.latitude, cityCoordinates.longitude, cityCoordinates.latitude]);
    
    res.json({
      success: true,
      message: spotsCreated > 0 
        ? `Created ${spotsCreated} parking spots in ${cityName}`
        : `Found existing parking spots in ${cityName}`,
      city_name: cityName,
      city_location: cityCoordinates,
      spots: allCitySpots,
      spots_created: spotsCreated,
      total_spots_found: allCitySpots.length
    });
    
  } catch (error) {
    console.error('City search error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Function to get coordinates for major Indian cities
function getCityCoordinates(cityName) {
  const cities = {
    'delhi': { latitude: 28.6139, longitude: 77.2090, state: 'Delhi' },
    'new delhi': { latitude: 28.6139, longitude: 77.2090, state: 'Delhi' },
    'mumbai': { latitude: 19.0760, longitude: 72.8777, state: 'Maharashtra' },
    'bangalore': { latitude: 12.9716, longitude: 77.5946, state: 'Karnataka' },
    'bengaluru': { latitude: 12.9716, longitude: 77.5946, state: 'Karnataka' },
    'chennai': { latitude: 13.0827, longitude: 80.2707, state: 'Tamil Nadu' },
    'kolkata': { latitude: 22.5726, longitude: 88.3639, state: 'West Bengal' },
    'hyderabad': { latitude: 17.3850, longitude: 78.4867, state: 'Telangana' },
    'pune': { latitude: 18.5204, longitude: 73.8567, state: 'Maharashtra' },
    'ahmedabad': { latitude: 23.0225, longitude: 72.5714, state: 'Gujarat' },
    'jaipur': { latitude: 26.9124, longitude: 75.7873, state: 'Rajasthan' },
    'lucknow': { latitude: 26.8467, longitude: 80.9462, state: 'Uttar Pradesh' },
    'kanpur': { latitude: 26.4499, longitude: 80.3319, state: 'Uttar Pradesh' },
    'nagpur': { latitude: 21.1458, longitude: 79.0882, state: 'Maharashtra' },
    'indore': { latitude: 22.7196, longitude: 75.8577, state: 'Madhya Pradesh' },
    'thane': { latitude: 19.2183, longitude: 72.9781, state: 'Maharashtra' },
    'bhopal': { latitude: 23.2599, longitude: 77.4126, state: 'Madhya Pradesh' },
    'visakhapatnam': { latitude: 17.6868, longitude: 83.2185, state: 'Andhra Pradesh' },
    'pimpri chinchwad': { latitude: 18.6298, longitude: 73.7997, state: 'Maharashtra' },
    'patna': { latitude: 25.5941, longitude: 85.1376, state: 'Bihar' },
    'belagavi': { latitude: 15.8497, longitude: 74.4977, state: 'Karnataka' },
    'belgaum': { latitude: 15.8497, longitude: 74.4977, state: 'Karnataka' }
  };
  
  const normalizedCity = cityName.toLowerCase().trim();
  return cities[normalizedCity] || null;
}

// Function to generate multiple parking spots across a city
function generateCityParkingSpots(cityName, cityCoordinates) {
  const spots = [];
  const areas = [
    'City Center', 'Railway Station', 'Airport', 'Mall', 'Hospital', 
    'Business District', 'Market Area', 'University', 'Stadium', 'Metro Station'
  ];
  
  areas.forEach((area, index) => {
    // Generate coordinates around the city center (within 5km radius)
    const latOffset = (Math.random() - 0.5) * 0.09; // ~5km
    const lngOffset = (Math.random() - 0.5) * 0.09; // ~5km
    
    const spotData = {
      name: `${area} Parking - ${cityName}`,
      address: `${area}, ${cityName}, ${cityCoordinates.state || 'India'}`,
      latitude: cityCoordinates.latitude + latOffset,
      longitude: cityCoordinates.longitude + lngOffset,
      total_spots: 50 + (index * 10), // Varying capacity
      available_spots: 50 + (index * 10),
      car_spots: 30 + (index * 5),
      available_car_spots: 30 + (index * 5),
      bike_spots: 15 + (index * 3),
      available_bike_spots: 15 + (index * 3),
      truck_spots: 5 + (index * 2),
      available_truck_spots: 5 + (index * 2),
      price_per_hour: 20 + (index * 5), // Varying prices
      car_price_per_hour: 20 + (index * 5),
      bike_price_per_hour: 10 + (index * 2),
      truck_price_per_hour: 50 + (index * 10),
      features: JSON.stringify(['24/7 Access', 'Security Camera', 'Well Lit', 'City Auto-Created'])
    };
    
    spots.push(spotData);
  });
  
  return spots;
}

// Function to notify admins of city parking creation
async function notifyAdminsOfCityCreation(user, cityName, spotsCreated, cityCoordinates) {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    // Get all admin users
    const [admins] = await db.query(`
      SELECT id, name, email FROM users 
      WHERE role IN ('admin', 'super_admin') AND is_active = TRUE
    `);
    
    for (const admin of admins) {
      try {
        // Create admin notification in database
        await db.query(`
          INSERT INTO notifications (user_id, type, title, message, metadata)
          VALUES (?, 'admin_alert', 'City Parking Spots Created', ?, ?)
        `, [
          admin.id,
          `${user.name} searched for parking in ${cityName} and ${spotsCreated} parking spots were auto-created`,
          JSON.stringify({
            type: 'city_parking_spots_creation',
            user_id: user.id,
            user_name: user.name,
            user_email: user.email,
            city_name: cityName,
            spots_created: spotsCreated,
            city_coordinates: cityCoordinates,
            timestamp: new Date().toISOString()
          })
        ]);
        
        console.log(`📧 Admin notification sent to ${admin.name} about city parking creation in ${cityName}`);
      } catch (error) {
        console.error(`Failed to notify admin ${admin.name}:`, error);
      }
    }
    
    console.log(`✅ Notified ${admins.length} admins of city parking creation in ${cityName} by ${user.name}`);
  } catch (error) {
    console.error('Failed to notify admins of city creation:', error);
  }
}
router.post('/distance', authenticateToken, async (req, res) => {
  try {
    const { lat1, lon1, lat2, lon2 } = req.body;

    if (!lat1 || !lon1 || !lat2 || !lon2) {
      return res.status(400).json({
        success: false,
        error: 'All coordinates (lat1, lon1, lat2, lon2) are required'
      });
    }

    // Haversine formula
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    res.json({
      success: true,
      distance_km: Math.round(distance * 100) / 100,
      distance_m: Math.round(distance * 1000),
      coordinates: {
        from: { latitude: lat1, longitude: lon1 },
        to: { latitude: lat2, longitude: lon2 }
      }
    });
  } catch (error) {
    console.error('Distance calculation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;