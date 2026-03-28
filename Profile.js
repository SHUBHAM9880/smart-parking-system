import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert } from 'react-bootstrap';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (formData.phone && !/^\+?[\d\s-()]+$/.test(formData.phone)) {
      newErrors.phone = 'Please enter a valid phone number';
    }
    
    // Password validation only if user is trying to change password
    if (formData.newPassword || formData.confirmPassword) {
      if (!formData.currentPassword) {
        newErrors.currentPassword = 'Current password is required to change password';
      }
      
      if (!formData.newPassword) {
        newErrors.newPassword = 'New password is required';
      } else if (formData.newPassword.length < 8) {
        newErrors.newPassword = 'Password must be at least 8 characters';
      } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(formData.newPassword)) {
        newErrors.newPassword = 'Password must contain uppercase, lowercase, number, and special character';
      }
      
      if (!formData.confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your new password';
      } else if (formData.newPassword !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }
    
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const formErrors = validateForm();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }
    
    setLoading(true);
    setErrors({});
    
    try {
      // Simulate API call to update profile
      // In a real app, you would make an API call here
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update user context
      updateUser({
        name: formData.name,
        email: formData.email,
        phone: formData.phone
      });
      
      toast.success('Profile updated successfully!');
      
      // Clear password fields
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
      
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="py-4 fade-in">
      <Row className="mb-4">
        <Col>
          <h2>
            <i className="fas fa-user-circle me-2"></i>
            Profile Settings
          </h2>
          <p className="text-muted">Manage your account information and preferences</p>
        </Col>
      </Row>

      <Row>
        <Col lg={8}>
          <Card className="dashboard-card">
            <Card.Header>
              <h5 className="mb-0">
                <i className="fas fa-edit me-2"></i>
                Personal Information
              </h5>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleSubmit}>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        <i className="fas fa-user me-2"></i>
                        Full Name *
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                        isInvalid={!!errors.name}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.name}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        <i className="fas fa-envelope me-2"></i>
                        Email Address *
                      </Form.Label>
                      <Form.Control
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="Enter your email address"
                        isInvalid={!!errors.email}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.email}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-4">
                  <Form.Label>
                    <i className="fas fa-phone me-2"></i>
                    Phone Number
                  </Form.Label>
                  <Form.Control
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Enter your phone number"
                    isInvalid={!!errors.phone}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.phone}
                  </Form.Control.Feedback>
                </Form.Group>

                <hr className="my-4" />

                <h6 className="mb-3">
                  <i className="fas fa-key me-2"></i>
                  Change Password
                </h6>

                <Form.Group className="mb-3">
                  <Form.Label>Current Password</Form.Label>
                  <Form.Control
                    type="password"
                    name="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    placeholder="Enter your current password"
                    isInvalid={!!errors.currentPassword}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.currentPassword}
                  </Form.Control.Feedback>
                </Form.Group>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>New Password</Form.Label>
                      <Form.Control
                        type="password"
                        name="newPassword"
                        value={formData.newPassword}
                        onChange={handleChange}
                        placeholder="Enter new password"
                        isInvalid={!!errors.newPassword}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.newPassword}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Confirm New Password</Form.Label>
                      <Form.Control
                        type="password"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder="Confirm new password"
                        isInvalid={!!errors.confirmPassword}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.confirmPassword}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                  <Button 
                    variant="primary" 
                    type="submit" 
                    disabled={loading}
                    className="px-4"
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save me-2"></i>
                        Update Profile
                      </>
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="dashboard-card">
            <Card.Header>
              <h5 className="mb-0">
                <i className="fas fa-info-circle me-2"></i>
                Account Information
              </h5>
            </Card.Header>
            <Card.Body>
              <div className="text-center mb-4">
                <div 
                  className="rounded-circle bg-primary text-white d-inline-flex align-items-center justify-content-center"
                  style={{ width: '80px', height: '80px', fontSize: '2rem' }}
                >
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <h5 className="mt-3 mb-1">{user?.name}</h5>
                <p className="text-muted small">{user?.email}</p>
              </div>

              <div className="small">
                <p><strong>Member Since:</strong> January 2024</p>
                <p><strong>Account Status:</strong> <span className="badge bg-success">Active</span></p>
                <p><strong>Total Bookings:</strong> 0</p>
                <p><strong>Loyalty Points:</strong> 0</p>
              </div>

              <hr />

              <div className="d-grid gap-2">
                <Button variant="outline-danger" size="sm">
                  <i className="fas fa-trash me-2"></i>
                  Delete Account
                </Button>
                <Button variant="outline-secondary" size="sm">
                  <i className="fas fa-download me-2"></i>
                  Export Data
                </Button>
              </div>
            </Card.Body>
          </Card>

          <Card className="dashboard-card mt-4">
            <Card.Header>
              <h5 className="mb-0">
                <i className="fas fa-shield-alt me-2"></i>
                Security Tips
              </h5>
            </Card.Header>
            <Card.Body>
              <ul className="small mb-0">
                <li>Use a strong, unique password</li>
                <li>Enable two-factor authentication</li>
                <li>Keep your contact information updated</li>
                <li>Review your account activity regularly</li>
                <li>Log out from shared devices</li>
              </ul>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Profile;