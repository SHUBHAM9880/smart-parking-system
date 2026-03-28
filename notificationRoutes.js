const express = require('express');
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      type, unread_only, read_only, limit, offset
    } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (unread_only === 'true') filters.unread_only = true;
    if (read_only === 'true') filters.read_only = true;
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    const notifications = await Notification.getByUserId(req.user.userId, filters);

    res.json({
      success: true,
      notifications: notifications.map(notification => notification.toJSON()),
      count: notifications.length
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get notification by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ 
        success: false,
        error: 'Notification not found' 
      });
    }

    // Check if user owns this notification
    if (notification.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    res.json({
      success: true,
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ 
        success: false,
        error: 'Notification not found' 
      });
    }

    if (notification.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Mark notification as unread
router.patch('/:id/unread', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ 
        success: false,
        error: 'Notification not found' 
      });
    }

    if (notification.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    await notification.markAsUnread();

    res.json({
      success: true,
      message: 'Notification marked as unread',
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Error marking notification as unread:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Mark all notifications as read
router.patch('/all/read', authenticateToken, async (req, res) => {
  try {
    await Notification.markAllAsRead(req.user.userId);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ 
        success: false,
        error: 'Notification not found' 
      });
    }

    if (notification.user_id !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    await notification.delete();

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Delete all read notifications
router.delete('/all/read', authenticateToken, async (req, res) => {
  try {
    const deletedCount = await Notification.deleteAllRead(req.user.userId);

    res.json({
      success: true,
      message: `${deletedCount} read notifications deleted successfully`,
      deleted_count: deletedCount
    });
  } catch (error) {
    console.error('Error deleting read notifications:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get notification statistics
router.get('/statistics/summary', authenticateToken, async (req, res) => {
  try {
    const statistics = await Notification.getUserStatistics(req.user.userId);

    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Error fetching notification statistics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Create test notification (for demo purposes)
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const { title, message, type } = req.body;

    const notificationId = await Notification.create({
      user_id: req.user.userId,
      title: title || 'Test Notification',
      message: message || 'This is a test notification from the Ezy-Parking system.',
      type: type || 'info',
      metadata: { test: true, created_by: 'api' }
    });

    const notification = await Notification.findById(notificationId);

    res.status(201).json({
      success: true,
      message: 'Test notification created successfully',
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Error creating test notification:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

module.exports = router;