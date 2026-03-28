const express = require('express');
const { authenticateToken } = require('../middleware/authMiddleware');
const { getDatabase } = require('../config/database');

const router = express.Router();

// ============================================================================
// USER PREFERENCES API (Replace localStorage settings)
// ============================================================================

// Get user preferences
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const [preferences] = await db.execute(`
      CALL GetUserPreferences(?)
    `, [req.user.userId]);

    // Convert to key-value object for easy frontend use
    const prefsObject = {};
    if (preferences[0]) {
      preferences[0].forEach(pref => {
        prefsObject[pref.preference_key] = pref.preference_value;
      });
    }

    res.json({
      success: true,
      preferences: prefsObject
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Save user preference
router.post('/preferences', authenticateToken, async (req, res) => {
  try {
    const { key, value, category = 'general' } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Key and value are required' 
      });
    }

    const db = getDatabase();
    await db.execute(`
      CALL SaveUserPreference(?, ?, ?, ?)
    `, [req.user.userId, key, JSON.stringify(value), category]);

    res.json({
      success: true,
      message: 'Preference saved successfully'
    });
  } catch (error) {
    console.error('Error saving preference:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Bulk save preferences
router.post('/preferences/bulk', authenticateToken, async (req, res) => {
  try {
    const { preferences } = req.body;
    
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ 
        success: false, 
        error: 'Preferences object is required' 
      });
    }

    const db = getDatabase();
    
    // Save each preference
    for (const [key, value] of Object.entries(preferences)) {
      await db.execute(`
        CALL SaveUserPreference(?, ?, ?, ?)
      `, [req.user.userId, key, JSON.stringify(value), 'general']);
    }

    res.json({
      success: true,
      message: 'Preferences saved successfully',
      count: Object.keys(preferences).length
    });
  } catch (error) {
    console.error('Error saving bulk preferences:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// UI STATE API (Replace localStorage UI data)
// ============================================================================

// Get UI state for component
router.get('/ui-state/:component', authenticateToken, async (req, res) => {
  try {
    const { component } = req.params;
    const db = getDatabase();
    
    const [uiState] = await db.execute(`
      SELECT state_data, updated_at 
      FROM ui_state 
      WHERE user_id = ? AND component_name = ?
    `, [req.user.userId, component]);

    res.json({
      success: true,
      state: uiState[0]?.state_data || null,
      lastUpdated: uiState[0]?.updated_at || null
    });
  } catch (error) {
    console.error('Error fetching UI state:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Save UI state for component
router.post('/ui-state/:component', authenticateToken, async (req, res) => {
  try {
    const { component } = req.params;
    const { state, persistent = true } = req.body;
    const sessionId = req.headers['x-session-id'] || 'default';

    const db = getDatabase();
    await db.execute(`
      CALL SaveUIState(?, ?, ?, ?, ?)
    `, [req.user.userId, sessionId, component, JSON.stringify(state), persistent]);

    res.json({
      success: true,
      message: 'UI state saved successfully'
    });
  } catch (error) {
    console.error('Error saving UI state:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// SEARCH HISTORY API (Replace localStorage search data)
// ============================================================================

// Get search history
router.get('/search-history', authenticateToken, async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    const db = getDatabase();
    
    let query = `
      SELECT search_query, search_type, search_filters, results_count, created_at
      FROM search_history 
      WHERE user_id = ?
    `;
    let params = [req.user.userId];

    if (type) {
      query += ' AND search_type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [history] = await db.execute(query, params);

    res.json({
      success: true,
      history: history
    });
  } catch (error) {
    console.error('Error fetching search history:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Save search query
router.post('/search-history', authenticateToken, async (req, res) => {
  try {
    const { query, type = 'general', filters = null, resultsCount = 0 } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query is required' 
      });
    }

    const db = getDatabase();
    await db.execute(`
      INSERT INTO search_history (user_id, search_query, search_type, search_filters, results_count, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.userId, query, type, JSON.stringify(filters), resultsCount, req.ip]);

    res.json({
      success: true,
      message: 'Search saved to history'
    });
  } catch (error) {
    console.error('Error saving search history:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// LOCATION HISTORY API (Replace localStorage location data)
// ============================================================================

// Get location history
router.get('/location-history', authenticateToken, async (req, res) => {
  try {
    const { type, limit = 20 } = req.query;
    const db = getDatabase();
    
    let query = `
      SELECT latitude, longitude, address, city, location_type, is_favorite, nickname, created_at
      FROM location_history 
      WHERE user_id = ?
    `;
    let params = [req.user.userId];

    if (type) {
      query += ' AND location_type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [locations] = await db.execute(query, params);

    res.json({
      success: true,
      locations: locations
    });
  } catch (error) {
    console.error('Error fetching location history:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Save location
router.post('/location-history', authenticateToken, async (req, res) => {
  try {
    const { 
      latitude, longitude, address, city, state, country, 
      type = 'current', isFavorite = false, nickname 
    } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        error: 'Latitude and longitude are required' 
      });
    }

    const db = getDatabase();
    await db.execute(`
      INSERT INTO location_history 
      (user_id, latitude, longitude, address, city, state, country, location_type, is_favorite, nickname)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.user.userId, latitude, longitude, address, city, state, country, type, isFavorite, nickname]);

    res.json({
      success: true,
      message: 'Location saved successfully'
    });
  } catch (error) {
    console.error('Error saving location:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// USER VEHICLES API (Replace localStorage vehicle data)
// ============================================================================

// Get user vehicles
router.get('/vehicles', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const [vehicles] = await db.execute(`
      SELECT id, vehicle_number, vehicle_color, vehicle_type, vehicle_model, 
             vehicle_brand, is_primary, is_verified, created_at
      FROM user_vehicles 
      WHERE user_id = ?
      ORDER BY is_primary DESC, created_at DESC
    `, [req.user.userId]);

    res.json({
      success: true,
      vehicles: vehicles
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Add vehicle
router.post('/vehicles', authenticateToken, async (req, res) => {
  try {
    const { 
      vehicleNumber, vehicleColor, vehicleType, vehicleModel, 
      vehicleBrand, isPrimary = false 
    } = req.body;
    
    if (!vehicleNumber || !vehicleColor || !vehicleType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vehicle number, color, and type are required' 
      });
    }

    const db = getDatabase();
    
    // If setting as primary, unset other primary vehicles
    if (isPrimary) {
      await db.execute(`
        UPDATE user_vehicles SET is_primary = FALSE WHERE user_id = ?
      `, [req.user.userId]);
    }

    await db.execute(`
      INSERT INTO user_vehicles 
      (user_id, vehicle_number, vehicle_color, vehicle_type, vehicle_model, vehicle_brand, is_primary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [req.user.userId, vehicleNumber, vehicleColor, vehicleType, vehicleModel, vehicleBrand, isPrimary]);

    res.json({
      success: true,
      message: 'Vehicle added successfully'
    });
  } catch (error) {
    console.error('Error adding vehicle:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ success: false, error: 'Vehicle number already exists' });
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
});

// ============================================================================
// FORM BACKUP API (Replace localStorage form data)
// ============================================================================

// Get form backup
router.get('/form-backup/:formName', authenticateToken, async (req, res) => {
  try {
    const { formName } = req.params;
    const db = getDatabase();
    
    const [backup] = await db.execute(`
      SELECT form_data, step_number, is_completed, updated_at
      FROM form_backup 
      WHERE user_id = ? AND form_name = ? AND expires_at > NOW()
    `, [req.user.userId, formName]);

    res.json({
      success: true,
      backup: backup[0] || null
    });
  } catch (error) {
    console.error('Error fetching form backup:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Save form backup
router.post('/form-backup/:formName', authenticateToken, async (req, res) => {
  try {
    const { formName } = req.params;
    const { formData, stepNumber = 1, isCompleted = false, expiryHours = 24 } = req.body;
    const sessionId = req.headers['x-session-id'] || 'default';
    
    if (!formData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Form data is required' 
      });
    }

    const db = getDatabase();
    const expiryDate = new Date(Date.now() + (expiryHours * 60 * 60 * 1000));
    
    await db.execute(`
      INSERT INTO form_backup 
      (user_id, session_id, form_name, form_data, step_number, is_completed, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        form_data = VALUES(form_data),
        step_number = VALUES(step_number),
        is_completed = VALUES(is_completed),
        expires_at = VALUES(expires_at),
        updated_at = CURRENT_TIMESTAMP
    `, [req.user.userId, sessionId, formName, JSON.stringify(formData), stepNumber, isCompleted, expiryDate]);

    res.json({
      success: true,
      message: 'Form backup saved successfully'
    });
  } catch (error) {
    console.error('Error saving form backup:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// SESSION MANAGEMENT API (Replace localStorage auth tokens)
// ============================================================================

// Get active sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const [sessions] = await db.execute(`
      SELECT id, device_info, ip_address, last_activity, created_at, 
             CASE WHEN session_token = ? THEN TRUE ELSE FALSE END as is_current
      FROM user_sessions 
      WHERE user_id = ? AND is_active = TRUE AND expires_at > NOW()
      ORDER BY last_activity DESC
    `, [req.headers.authorization?.replace('Bearer ', ''), req.user.userId]);

    res.json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Revoke session
router.delete('/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = getDatabase();
    
    await db.execute(`
      UPDATE user_sessions 
      SET is_active = FALSE 
      WHERE id = ? AND user_id = ?
    `, [sessionId, req.user.userId]);

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    console.error('Error revoking session:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// CLEANUP UTILITIES
// ============================================================================

// Clear expired data
router.post('/cleanup', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    
    // Clean expired sessions
    await db.execute(`DELETE FROM user_sessions WHERE expires_at < NOW()`);
    
    // Clean expired form backups
    await db.execute(`DELETE FROM form_backup WHERE expires_at < NOW()`);
    
    // Clean old search history (keep last 100 per user)
    await db.execute(`
      DELETE FROM search_history 
      WHERE user_id = ? AND id NOT IN (
        SELECT id FROM (
          SELECT id FROM search_history 
          WHERE user_id = ? 
          ORDER BY created_at DESC 
          LIMIT 100
        ) as recent
      )
    `, [req.user.userId, req.user.userId]);

    res.json({
      success: true,
      message: 'Cleanup completed successfully'
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;