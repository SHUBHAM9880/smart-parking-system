const express = require('express');
const { getDatabase } = require('../config/database');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Get parking slots grid for visual selection
router.get('/grid', async (req, res) => {
  try {
    const { spot_id, vehicle_type, date, from_time, to_time } = req.query;

    if (!spot_id || !vehicle_type) {
      return res.status(400).json({
        success: false,
        error: 'Spot ID and vehicle type are required'
      });
    }

    const db = getDatabase();

    // Get all slots for the parking spot and vehicle type from the actual database
    let query = `
      SELECT 
        ps.*,
        CASE 
          WHEN ps.status = 'maintenance' THEN 'maintenance'
          WHEN sb.id IS NOT NULL THEN 'booked'
          ELSE ps.status
        END as current_status
      FROM parking_slots ps
      LEFT JOIN slot_bookings sb ON ps.id = sb.slot_id 
        AND sb.booking_date = COALESCE(?, CURDATE())
        AND sb.status IN ('confirmed', 'active')
    `;

    let params = [date || null];

    // Add time range filtering if provided
    if (from_time && to_time) {
      query += ` AND ((sb.start_time < ? AND sb.end_time > ?) OR (sb.start_time < ? AND sb.end_time > ?) OR (sb.start_time >= ? AND sb.end_time <= ?))`;
      params.push(to_time, from_time, from_time, to_time, from_time, to_time);
    }

    query += ` WHERE ps.spot_id = ? AND ps.vehicle_type = ? AND ps.is_active = 1 ORDER BY ps.slot_number`;
    params.push(spot_id, vehicle_type);

    const [slots] = await db.execute(query, params);

    // Add selection state and organize slots with proper row/position data
    const slotsWithSelection = slots.map((slot, index) => {
      // Determine row and position based on vehicle type and slot number
      let slot_row = 1;
      let slot_position = index + 1;

      if (vehicle_type === 'car') {
        // Cars: 5 slots per row (C01-C05: Row 1, C06-C10: Row 2, C11-C15: Row 3)
        slot_row = Math.ceil((index + 1) / 5);
        slot_position = ((index) % 5) + 1;
      } else if (vehicle_type === 'bike') {
        // Bikes: 4 slots per row (B01-B04: Row 4, B05-B08: Row 5)
        slot_row = Math.ceil((index + 1) / 4) + 3; // Start from row 4
        slot_position = ((index) % 4) + 1;
      } else if (vehicle_type === 'truck') {
        // Trucks: 2 slots in row 6
        slot_row = 6;
        slot_position = index + 1;
      }

      return {
        ...slot,
        isSelected: false,
        status: slot.current_status || slot.status,
        slot_row: slot.slot_row || slot_row,
        slot_position: slot.slot_position || slot_position
      };
    });

    console.log(`Fetched ${slotsWithSelection.length} ${vehicle_type} slots for spot ${spot_id}`);

    res.json({
      success: true,
      slots: slotsWithSelection,
      count: slotsWithSelection.length,
      vehicle_type: vehicle_type,
      spot_id: spot_id
    });

  } catch (error) {
    console.error('Error fetching parking slots grid:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get available slots for a specific time period
router.get('/available', async (req, res) => {
  try {
    const { spot_id, vehicle_type, date, start_time, end_time } = req.query;

    if (!spot_id || !vehicle_type || !date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: 'All parameters are required: spot_id, vehicle_type, date, start_time, end_time'
      });
    }

    const db = getDatabase();

    // Find slots that are not booked during the requested time period
    const [availableSlots] = await db.execute(`
      SELECT ps.*
      FROM parking_slots ps
      WHERE ps.spot_id = ? 
        AND ps.slot_type = ?
        AND ps.is_active = true
        AND ps.status = 'available'
        AND ps.id NOT IN (
          SELECT sb.slot_id
          FROM slot_bookings sb
          WHERE sb.slot_id = ps.id
            AND sb.booking_date = ?
            AND sb.status IN ('confirmed', 'active')
            AND (
              (sb.start_time < ? AND sb.end_time > ?)
              OR (sb.start_time < ? AND sb.end_time > ?)
              OR (sb.start_time >= ? AND sb.end_time <= ?)
            )
        )
      ORDER BY ps.slot_row, ps.slot_position
    `, [
      spot_id,
      vehicle_type,
      date,
      end_time, start_time,  // Check if booking ends after our start
      start_time, end_time,  // Check if booking starts before our end
      start_time, end_time   // Check if booking is completely within our period
    ]);

    res.json({
      success: true,
      slots: availableSlots,
      count: availableSlots.length
    });

  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Book specific slots
router.post('/book', authenticateToken, async (req, res) => {
  try {
    const {
      slot_ids,
      booking_date,
      start_time,
      end_time,
      vehicle_number,
      vehicle_type,
      vehicle_color,
      mobile_number,
      payment_method
    } = req.body;

    if (!slot_ids || !Array.isArray(slot_ids) || slot_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one slot ID is required'
      });
    }

    if (!booking_date || !start_time || !end_time || !vehicle_number || !vehicle_type) {
      return res.status(400).json({
        success: false,
        error: 'All booking details are required'
      });
    }

    const db = getDatabase();

    // Start transaction
    await db.execute('START TRANSACTION');

    try {
      // Check if all slots are available
      const [conflictingBookings] = await db.execute(`
        SELECT sb.slot_id, ps.slot_number
        FROM slot_bookings sb
        JOIN parking_slots ps ON sb.slot_id = ps.id
        WHERE sb.slot_id IN (${slot_ids.map(() => '?').join(',')})
          AND sb.booking_date = ?
          AND sb.status IN ('confirmed', 'active')
          AND (
            (sb.start_time < ? AND sb.end_time > ?)
            OR (sb.start_time < ? AND sb.end_time > ?)
            OR (sb.start_time >= ? AND sb.end_time <= ?)
          )
      `, [
        ...slot_ids,
        booking_date,
        end_time, start_time,
        start_time, end_time,
        start_time, end_time
      ]);

      if (conflictingBookings.length > 0) {
        await db.execute('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: 'Some slots are already booked for the selected time',
          conflicting_slots: conflictingBookings.map(cb => cb.slot_number)
        });
      }

      // Get slot details and calculate total amount
      const [slotDetails] = await db.execute(`
        SELECT ps.*, psp.name as spot_name
        FROM parking_slots ps
        JOIN parking_spots psp ON ps.spot_id = psp.id
        WHERE ps.id IN (${slot_ids.map(() => '?').join(',')})
      `, slot_ids);

      if (slotDetails.length !== slot_ids.length) {
        await db.execute('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Some slots not found'
        });
      }

      // Calculate duration and total amount
      const startDateTime = new Date(`${booking_date}T${start_time}`);
      const endDateTime = new Date(`${booking_date}T${end_time}`);
      const durationHours = (endDateTime - startDateTime) / (1000 * 60 * 60);
      const totalAmount = slotDetails.reduce((sum, slot) => sum + (slot.price_per_hour * durationHours), 0);

      // Create main booking record
      const [bookingResult] = await db.execute(`
        INSERT INTO bookings (
          user_id, spot_id, vehicle_number, vehicle_color, vehicle_type,
          mobile_number, duration, total_price, booking_date, booking_time,
          end_time, payment_method, status, booking_ref
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `, [
        req.user.userId,
        slotDetails[0].spot_id,
        vehicle_number,
        vehicle_color,
        vehicle_type,
        mobile_number,
        durationHours,
        totalAmount,
        booking_date,
        start_time,
        end_time,
        payment_method,
        `BK${Date.now()}`
      ]);

      const bookingId = bookingResult.insertId;

      // Create slot booking records
      for (const slot of slotDetails) {
        await db.execute(`
          INSERT INTO slot_bookings (
            booking_id, slot_id, user_id, spot_id, slot_number,
            booking_date, start_time, end_time, duration, amount,
            vehicle_number, vehicle_type, vehicle_color, mobile_number,
            payment_method, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, [
          bookingId,
          slot.id,
          req.user.userId,
          slot.spot_id,
          slot.slot_number,
          booking_date,
          start_time,
          end_time,
          durationHours,
          slot.price_per_hour * durationHours,
          vehicle_number,
          vehicle_type,
          vehicle_color,
          mobile_number,
          payment_method
        ]);

        // Update slot status
        await db.execute(`
          UPDATE parking_slots 
          SET status = 'booked', last_booking_id = ?
          WHERE id = ?
        `, [bookingId, slot.id]);
      }

      // Commit transaction
      await db.execute('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Slots booked successfully',
        booking: {
          id: bookingId,
          booking_ref: `BK${Date.now()}`,
          slots: slotDetails.map(slot => slot.slot_number),
          total_amount: totalAmount,
          duration_hours: durationHours,
          booking_date,
          start_time,
          end_time
        }
      });

    } catch (error) {
      await db.execute('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error booking slots:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get slot details by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const db = getDatabase();

    const [slots] = await db.execute(`
      SELECT ps.*, psp.name as spot_name, psp.address as spot_address
      FROM parking_slots ps
      JOIN parking_spots psp ON ps.spot_id = psp.id
      WHERE ps.id = ?
    `, [id]);

    if (slots.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Slot not found'
      });
    }

    res.json({
      success: true,
      slot: slots[0]
    });

  } catch (error) {
    console.error('Error fetching slot details:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update slot status (admin only)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['available', 'booked', 'occupied', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    const db = getDatabase();

    const [result] = await db.execute(`
      UPDATE parking_slots 
      SET status = ?, updated_at = NOW()
      WHERE id = ?
    `, [status, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Slot not found'
      });
    }

    res.json({
      success: true,
      message: 'Slot status updated successfully'
    });

  } catch (error) {
    console.error('Error updating slot status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get slot statistics
router.get('/stats/:spot_id', async (req, res) => {
  try {
    const { spot_id } = req.params;
    const { vehicle_type } = req.query;

    const db = getDatabase();

    let query = `
      SELECT 
        slot_type,
        COUNT(*) as total_slots,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_slots,
        SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) as booked_slots,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied_slots,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance_slots,
        AVG(price_per_hour) as avg_price_per_hour
      FROM parking_slots 
      WHERE spot_id = ? AND is_active = true
    `;

    let params = [spot_id];

    if (vehicle_type) {
      query += ' AND slot_type = ?';
      params.push(vehicle_type);
    }

    query += ' GROUP BY slot_type';

    const [stats] = await db.execute(query, params);

    res.json({
      success: true,
      statistics: stats
    });

  } catch (error) {
    console.error('Error fetching slot statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;