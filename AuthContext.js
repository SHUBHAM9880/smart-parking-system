import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { clearUserStorage, performCompleteCleanup } from '../utils/clearStorage';
import databaseStorage from '../utils/databaseStorage';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Set up axios defaults
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Verify token validity
      verifyToken(token);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (token) => {
    try {
      // Verify token with the server
      const response = await axios.get('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setUser(response.data.user);
        
        // Migrate localStorage data to database on first login
        const migrationKey = `migrated_${response.data.user.id}`;
        const hasMigrated = await databaseStorage.getPreference(migrationKey, false);
        
        if (!hasMigrated) {
          console.log('🔄 First login detected, migrating localStorage to database...');
          const migrationSuccess = await databaseStorage.migrateFromLocalStorage();
          if (migrationSuccess) {
            await databaseStorage.setPreference(migrationKey, true, 'system');
            console.log('✅ Migration completed successfully');
          }
        }
      } else {
        // Clear invalid token data
        performCompleteCleanup();
        setUser(null);
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      // Clear invalid token data
      performCompleteCleanup();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password, navigate) => {
    try {
      setLoading(true);
      const response = await axios.post('/api/auth/login', { email, password });
      
      const { token, user: userData } = response.data;
      
      // Store token and user data
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      
      // Set axios default header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(userData);
      
      // Save login preferences to database
      await databaseStorage.setPreference('lastLoginTime', new Date().toISOString(), 'auth');
      await databaseStorage.setPreference('loginCount', 
        (await databaseStorage.getPreference('loginCount', 0)) + 1, 'auth');
      
      // Check if user is admin and redirect accordingly
      if (userData.role === 'admin' || userData.role === 'super_admin') {
        toast.success(`Welcome Admin ${userData.name}!`);
        if (navigate) {
          navigate('/admin');
        }
        return { success: true, isAdmin: true, redirectTo: '/admin' };
      } else {
        toast.success('Login successful!');
        return { success: true, isAdmin: false };
      }
      
    } catch (error) {
      const errorData = error.response?.data;
      const message = errorData?.error || 'Login failed';
      
      if (errorData?.requires_verification) {
        toast.error('Please verify your email address before logging in');
        return { 
          success: false, 
          error: message, 
          requires_verification: true,
          email: errorData.email 
        };
      }
      
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    try {
      setLoading(true);
      
      // Use different endpoint based on whether email is verified via OTP
      const endpoint = userData.emailVerified ? '/api/auth/register-verified' : '/api/auth/register';
      const response = await axios.post(endpoint, userData);
      
      if (response.data.token) {
        // User is logged in immediately after verified registration
        const { token, user: newUser } = response.data;
        
        // Store token and user data
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(newUser));
        
        // Set axios default header
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        setUser(newUser);
        
        // Save registration preferences to database
        await databaseStorage.setPreference('registrationDate', new Date().toISOString(), 'auth');
        await databaseStorage.setPreference('isNewUser', true, 'auth');
        
        toast.success('Registration successful! You are now logged in.');
        
        return { success: true };
      } else {
        // Regular registration requiring email verification
        toast.success('Registration successful! Please check your email to verify your account.');
        return { success: true, requires_verification: true };
      }
    } catch (error) {
      const message = error.response?.data?.error || 'Registration failed';
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Save logout time to database
      await databaseStorage.setPreference('lastLogoutTime', new Date().toISOString(), 'auth');
      
      // Clear database cache
      databaseStorage.clearCache();
    } catch (error) {
      console.error('Error saving logout data:', error);
    }
    
    // Perform complete cleanup of all user data
    performCompleteCleanup();
    
    // Clear axios default header
    delete axios.defaults.headers.common['Authorization'];
    
    setUser(null);
    toast.info('Logged out successfully');
  };

  // Method to clear storage manually
  const clearStorage = () => {
    return clearUserStorage();
  };

  const updateUser = async (updatedUserData) => {
    const newUserData = { ...user, ...updatedUserData };
    setUser(newUserData);
    localStorage.setItem('user', JSON.stringify(newUserData));
    
    // Save profile update time to database
    try {
      await databaseStorage.setPreference('lastProfileUpdate', new Date().toISOString(), 'auth');
    } catch (error) {
      console.error('Error saving profile update data:', error);
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateUser,
    clearStorage
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};