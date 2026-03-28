const cron = require('node-cron');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Notification = require('../models/Notification');
const emailService = require('./emailService');

class SchedulerService {
  constructor() {
    this.jobs = [];
    this.initializeScheduledJobs();
  }

  // Initialize all scheduled jobs
  initializeScheduledJobs() {
    console.log('🕐 Initializing scheduled jobs...');
    
    // Check for booking reminders every 5 minutes
    this.scheduleBookingReminders();
    
    // Check for expired bookings every minute
    this.scheduleExpiredBookingsCheck();
    
    // Daily cleanup tasks at midnight
    this.scheduleDailyCleanup();
    
    // Weekly reports every Sunday at 9 AM
    this.scheduleWeeklyReports();
    
    console.log('✅ All scheduled jobs initialized');
  }

  // Schedule booking reminders (15 minutes before expiry)
  scheduleBookingReminders() {
    const job = cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('🔔 Checking for booking reminders...');
        
        // Find bookings that expire in the next 15 minutes
        const { getDatabase } = require('../config/database');
        const db = getDatabase();
        
        const [bookings] = await db.query(`
          SELECT b.*, ps.name as spot_name, ps.address as spot_address, 
                 u.name as user_name, u.email as user_email
          FROM bookings b
          JOIN parking_spots ps ON b.spot_id = ps.id
          JOIN users u ON b.user_id = u.id
          WHERE b.status = 'active' 
            AND b.end_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 15 MINUTE)
            AND b.id NOT IN (
              SELECT DISTINCT JSON_EXTRACT(metadata, '$.booking_id')
              FROM notifications 
              WHERE type = 'booking' 
                AND JSON_EXTRACT(metadata, '$.type') = 'booking_ending_soon'
                AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            )
        `);

        for (const booking of bookings) {
          // Send notification
          await Notification.sendBookingNotification(booking.user_id, {
            booking_id: booking.id,
            booking_ref: booking.booking_ref,
            spot_name: booking.spot_name
          }, 'booking_ending_soon');

          // Send email reminder
          if (booking.user_email) {
            await emailService.sendBookingReminder(booking.user_email, booking);
          }

          console.log(`📧 Reminder sent for booking ${booking.booking_ref}`);
        }

        if (bookings.length > 0) {
          console.log(`✅ Sent ${bookings.length} booking reminders`);
        }
      } catch (error) {
        console.error('❌ Error in booking reminders job:', error.message);
      }
    });

    this.jobs.push({ name: 'booking-reminders', job });
    console.log('📅 Scheduled: Booking reminders every 5 minutes');
  }

  // Schedule expired bookings check
  scheduleExpiredBookingsCheck() {
    const job = cron.schedule('* * * * *', async () => {
      try {
        // Find expired bookings
        const { getDatabase } = require('../config/database');
        const db = getDatabase();
        
        const [expiredBookings] = await db.query(`
          SELECT b.*, ps.name as spot_name, ps.address as spot_address, 
                 u.name as user_name, u.email as user_email, u.phone as user_phone
          FROM bookings b
          JOIN parking_spots ps ON b.spot_id = ps.id
          JOIN users u ON b.user_id = u.id
          WHERE b.status = 'active' AND b.end_time < NOW()
        `);

        for (const booking of expiredBookings) {
          console.log(`⏰ Processing expired booking: ${booking.booking_ref}`);
          
          // Update booking status to expired
          await db.query('UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?', ['expired', booking.id]);

          // Release the parking slot - Update parking spot availability
          await db.query(`
            UPDATE parking_spots SET 
              available_spots = available_spots + 1,
              available_car_spots = CASE WHEN ? = 'car' THEN available_car_spots + 1 ELSE available_car_spots END,
              available_bike_spots = CASE WHEN ? = 'bike' THEN available_bike_spots + 1 ELSE available_bike_spots END,
              available_truck_spots = CASE WHEN ? = 'truck' THEN available_truck_spots + 1 ELSE available_truck_spots END
            WHERE id = ?
          `, [booking.vehicle_type, booking.vehicle_type, booking.vehicle_type, booking.spot_id]);

          // 🔄 REAL-TIME SLOT UPDATE: Emit slot availability update to all connected clients
          try {
            // Get updated parking spot data
            const [updatedSpot] = await db.query(`
              SELECT id, name, available_spots, total_spots,
                     available_car_spots, car_spots,
                     available_bike_spots, bike_spots,
                     available_truck_spots, truck_spots
              FROM parking_spots WHERE id = ?
            `, [booking.spot_id]);

            if (updatedSpot.length > 0) {
              const spotData = updatedSpot[0];
              
              // Use socket manager to emit real-time update
              const socketManager = require('./socketManager');
              
              const updateData = {
                spotId: booking.spot_id,
                spotName: booking.spot_name,
                bookingRef: booking.booking_ref,
                vehicleType: booking.vehicle_type,
                availabilityData: {
                  available_spots: spotData.available_spots,
                  total_spots: spotData.total_spots,
                  available_car_spots: spotData.available_car_spots,
                  car_spots: spotData.car_spots,
                  available_bike_spots: spotData.available_bike_spots,
                  bike_spots: spotData.bike_spots,
                  available_truck_spots: spotData.available_truck_spots,
                  truck_spots: spotData.truck_spots
                },
                message: `Slot released: ${booking.vehicle_type} spot now available at ${booking.spot_name}`,
                timestamp: new Date().toISOString()
              };
              
              const emitted = socketManager.emitSlotAvailabilityUpdate(updateData);
              
              if (emitted) {
                console.log(`🔄 Real-time slot update sent: ${booking.spot_name} - ${booking.vehicle_type} slot released`);
              } else {
                console.warn(`⚠️ Failed to send real-time update: Socket.IO not available`);
              }
            }
          } catch (socketError) {
            console.error(`❌ Failed to send real-time slot update for booking ${booking.booking_ref}:`, socketError.message);
          }

          // Send parking expiration email to user
          if (booking.user_email) {
            try {
              await emailService.sendParkingExpirationNotification(booking.user_email, {
                user_name: booking.user_name,
                booking_ref: booking.booking_ref,
                spot_name: booking.spot_name,
                spot_address: booking.spot_address,
                vehicle_type: booking.vehicle_type,
                vehicle_number: booking.vehicle_number,
                end_time: booking.end_time,
                duration: booking.duration,
                total_price: booking.total_price
              });
              console.log(`📧 Expiration email sent to ${booking.user_email} for booking ${booking.booking_ref}`);
            } catch (emailError) {
              console.error(`❌ Failed to send expiration email for booking ${booking.booking_ref}:`, emailError.message);
            }
          }

          // Send notification to user dashboard
          try {
            await Notification.sendBookingNotification(booking.user_id, {
              booking_id: booking.id,
              booking_ref: booking.booking_ref,
              spot_name: booking.spot_name,
              vehicle_type: booking.vehicle_type
            }, 'booking_expired');
          } catch (notificationError) {
            console.error(`❌ Failed to send notification for booking ${booking.booking_ref}:`, notificationError.message);
          }

          // Send admin notification about expired booking
          try {
            await emailService.sendAdminBookingExpirationNotification('shubhamyamakar9880@gmail.com', {
              user_name: booking.user_name,
              user_email: booking.user_email,
              booking_ref: booking.booking_ref,
              spot_name: booking.spot_name,
              vehicle_type: booking.vehicle_type,
              vehicle_number: booking.vehicle_number,
              expired_at: new Date().toISOString()
            });
          } catch (adminEmailError) {
            console.error(`❌ Failed to send admin notification for expired booking ${booking.booking_ref}:`, adminEmailError.message);
          }

          console.log(`✅ Booking ${booking.booking_ref} expired - slot released, emails sent`);
        }

        if (expiredBookings.length > 0) {
          console.log(`🎯 Processed ${expiredBookings.length} expired bookings - slots automatically released`);
        }
      } catch (error) {
        console.error('❌ Error in expired bookings check:', error.message);
      }
    });

    this.jobs.push({ name: 'expired-bookings', job });
    console.log('📅 Scheduled: Expired bookings check every minute');
  }

  // Schedule daily cleanup tasks
  scheduleDailyCleanup() {
    const job = cron.schedule('0 0 * * *', async () => {
      try {
        console.log('🧹 Running daily cleanup tasks...');
        
        // Clean up old notifications (older than 30 days)
        const deletedNotifications = await Notification.cleanup(30);
        console.log(`🗑️ Cleaned up ${deletedNotifications} old notifications`);

        // Clean up old system logs
        const { getDatabase } = require('../config/database');
        const db = getDatabase();
        
        const [logCleanup] = await db.query(`
          DELETE FROM system_logs 
          WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
        `);
        console.log(`🗑️ Cleaned up ${logCleanup.affectedRows} old system logs`);

        // Update sensor statistics
        const sensorStats = await require('../models/Sensor').getStatistics();
        console.log(`📊 Updated sensor statistics: ${sensorStats.total_sensors} sensors`);

        console.log('✅ Daily cleanup completed');
      } catch (error) {
        console.error('❌ Error in daily cleanup:', error.message);
      }
    });

    this.jobs.push({ name: 'daily-cleanup', job });
    console.log('📅 Scheduled: Daily cleanup at midnight');
  }

  // Schedule weekly reports
  scheduleWeeklyReports() {
    const job = cron.schedule('0 9 * * 0', async () => {
      try {
        console.log('📊 Generating weekly reports...');
        
        const { getDatabase } = require('../config/database');
        const db = getDatabase();
        
        // Get weekly statistics
        const [weeklyStats] = await db.query(`
          SELECT 
            COUNT(*) as total_bookings,
            SUM(total_price) as total_revenue,
            COUNT(DISTINCT user_id) as unique_users,
            AVG(duration) as avg_duration
          FROM bookings 
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);

        // Get top performing spots
        const [topSpots] = await db.query(`
          SELECT 
            ps.name,
            COUNT(b.id) as booking_count,
            SUM(b.total_price) as revenue
          FROM parking_spots ps
          JOIN bookings b ON ps.id = b.spot_id
          WHERE b.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          GROUP BY ps.id, ps.name
          ORDER BY booking_count DESC
          LIMIT 5
        `);

        const report = {
          period: 'Last 7 days',
          stats: weeklyStats[0],
          topSpots: topSpots,
          generatedAt: new Date().toISOString()
        };

        console.log('📈 Weekly Report:', JSON.stringify(report, null, 2));
        
        // Here you could send the report via email to administrators
        // await emailService.sendWeeklyReport('admin@ezyparking.com', report);

        console.log('✅ Weekly report generated');
      } catch (error) {
        console.error('❌ Error generating weekly report:', error.message);
      }
    });

    this.jobs.push({ name: 'weekly-reports', job });
    console.log('📅 Scheduled: Weekly reports every Sunday at 9 AM');
  }

  // Stop all scheduled jobs
  stopAllJobs() {
    console.log('🛑 Stopping all scheduled jobs...');
    
    this.jobs.forEach(({ name, job }) => {
      job.destroy();
      console.log(`❌ Stopped job: ${name}`);
    });
    
    this.jobs = [];
    console.log('✅ All scheduled jobs stopped');
  }

  // Get job status
  getJobStatus() {
    return this.jobs.map(({ name, job }) => ({
      name,
      running: job.running || false,
      scheduled: true
    }));
  }

  // Manual trigger for testing
  async triggerBookingReminders() {
    console.log('🔔 Manually triggering booking reminders...');
    // Implementation would be similar to the scheduled version
  }

  async triggerExpiredBookingsCheck() {
    console.log('⏰ Manually triggering expired bookings check...');
    // Implementation would be similar to the scheduled version
  }
}

// Export singleton instance
module.exports = new SchedulerService();