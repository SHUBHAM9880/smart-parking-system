import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Navbar from './components/Layout/Navbar';
import Home from './pages/Home';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import EmailVerification from './pages/Auth/EmailVerification';
import Dashboard from './pages/Dashboard/Dashboard';
import ParkingMap from './pages/Parking/ParkingMap';
import BookParking from './pages/Parking/BookParking';
import VehicleTracking from './pages/Tracking/VehicleTracking';
import BookingHistory from './pages/Booking/BookingHistory';
import Profile from './pages/Profile/Profile';
import AdminDashboard from './pages/Admin/AdminDashboard';
import AIRecommendations from './pages/Features/AIRecommendations';
import LoadingSpinner from './components/UI/LoadingSpinner';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="App">
      <Navbar />
      <main style={{ paddingTop: '80px', minHeight: 'calc(100vh - 80px)' }}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route 
            path="/login" 
            element={user ? <Navigate to="/dashboard" /> : <Login />} 
          />
          <Route 
            path="/register" 
            element={user ? <Navigate to="/dashboard" /> : <Register />} 
          />
          <Route 
            path="/verify-email/:token" 
            element={<EmailVerification />} 
          />
          <Route 
            path="/verify-email" 
            element={<EmailVerification />} 
          />
          
          {/* Feature Routes */}
          <Route 
            path="/ai-recommendations" 
            element={<AIRecommendations />} 
          />
          
          {/* Protected Routes */}
          <Route 
            path="/dashboard" 
            element={user ? <Dashboard /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/parking-map" 
            element={user ? <ParkingMap /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/book-parking" 
            element={user ? <BookParking /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/vehicle-tracking" 
            element={user ? <VehicleTracking /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/vehicle-tracking/:bookingId" 
            element={user ? <VehicleTracking /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/bookings" 
            element={user ? <BookingHistory /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/profile" 
            element={user ? <Profile /> : <Navigate to="/login" />} 
          />
          
          {/* Admin Routes */}
          <Route 
            path="/admin" 
            element={
              user && (user.role === 'admin' || user.role === 'super_admin') 
                ? <AdminDashboard /> 
                : <Navigate to="/dashboard" />
            } 
          />
          
          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;