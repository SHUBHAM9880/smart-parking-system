// Socket Manager - Centralized socket.io instance management
class SocketManager {
  constructor() {
    this.io = null;
  }

  // Set the socket.io instance
  setIO(io) {
    this.io = io;
    console.log('🔄 Socket.IO instance registered with SocketManager');
  }

  // Get the socket.io instance
  getIO() {
    return this.io;
  }

  // Emit real-time slot availability update
  emitSlotAvailabilityUpdate(updateData) {
    if (this.io) {
      this.io.emit('slot-availability-update', updateData);
      console.log(`🔄 Real-time slot update emitted: ${updateData.spotName} - ${updateData.vehicleType} slot released`);
      return true;
    } else {
      console.warn('⚠️ Socket.IO instance not available for real-time updates');
      return false;
    }
  }

  // Emit admin notification
  emitAdminNotification(notificationData) {
    if (this.io) {
      this.io.to('admin-room').emit('admin-notification', notificationData);
      console.log(`📡 Admin notification emitted: ${notificationData.message}`);
      return true;
    } else {
      console.warn('⚠️ Socket.IO instance not available for admin notifications');
      return false;
    }
  }

  // Check if socket.io is available
  isAvailable() {
    return this.io !== null;
  }
}

// Export singleton instance
module.exports = new SocketManager();