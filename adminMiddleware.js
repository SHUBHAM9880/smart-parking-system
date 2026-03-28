const User = require('../models/User');

// Check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    req.admin = user;
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Check if user is super admin
const requireSuperAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Super admin access required'
      });
    }

    req.admin = user;
    next();
  } catch (error) {
    console.error('Super admin middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Log admin activity
const logAdminActivity = async (adminId, actionType, targetType, targetId, actionDetails, req) => {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    await db.execute(`
      INSERT INTO admin_activity_logs 
      (admin_id, action_type, target_type, target_id, action_details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [adminId, actionType, targetType, targetId, JSON.stringify(actionDetails), ipAddress, userAgent]);
    
    console.log(`📝 Admin activity logged: ${actionType} on ${targetType} ${targetId} by admin ${adminId}`);
  } catch (error) {
    console.error('Failed to log admin activity:', error);
  }
};

module.exports = {
  requireAdmin,
  requireSuperAdmin,
  logAdminActivity
};