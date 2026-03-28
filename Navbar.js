import React, { useState, useEffect } from 'react';
import { Navbar as BootstrapNavbar, Nav, Container, NavDropdown, Badge } from 'react-bootstrap';
import { LinkContainer } from 'react-router-bootstrap';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

const Navbar = () => {
  const { user, logout } = useAuth();
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'super_admin')) {
      fetchPendingRequests();
      // Set up interval to check for new requests every 30 seconds
      const interval = setInterval(fetchPendingRequests, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchPendingRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/admin/location-requests?status=pending&limit=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.data.success) {
        // Get total count from a separate endpoint or use the count from response
        const countResponse = await axios.get('/api/admin/dashboard', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (countResponse.data.success) {
          setPendingRequests(countResponse.data.stats?.users?.pending_location_requests || 0);
        }
      }
    } catch (error) {
      console.error('Failed to fetch pending requests:', error);
      // Set to 0 on error to prevent UI issues
      setPendingRequests(0);
    }
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <BootstrapNavbar bg="light" expand="lg" fixed="top" className="shadow-sm">
      <Container>
        <LinkContainer to="/">
          <BootstrapNavbar.Brand className="fw-bold">
            <i className="fas fa-car me-2"></i>
            Smart Vehicle Parking System
          </BootstrapNavbar.Brand>
        </LinkContainer>
        
        <BootstrapNavbar.Toggle aria-controls="basic-navbar-nav" />
        
        <BootstrapNavbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <LinkContainer to="/">
              <Nav.Link>
                <i className="fas fa-home me-1"></i>
                Home
              </Nav.Link>
            </LinkContainer>
            
            {user && (
              <>
                {/* Show navigation items for regular users */}
                {user.role !== 'admin' && user.role !== 'super_admin' && (
                  <>
                    <LinkContainer to="/dashboard">
                      <Nav.Link>
                        <i className="fas fa-tachometer-alt me-1"></i>
                        Dashboard
                      </Nav.Link>
                    </LinkContainer>
                    
                    <LinkContainer to="/parking-map">
                      <Nav.Link>
                        <i className="fas fa-map-marker-alt me-1"></i>
                        Find Parking
                      </Nav.Link>
                    </LinkContainer>
                    
                    <LinkContainer to="/book-parking">
                      <Nav.Link>
                        <i className="fas fa-parking me-1"></i>
                        Book Parking
                      </Nav.Link>
                    </LinkContainer>
                  </>
                )}

                {/* Admin Module - Prominent placement for admin users */}
                {(user.role === 'admin' || user.role === 'super_admin') && (
                  <LinkContainer to="/admin">
                    <Nav.Link className="text-primary fw-bold position-relative">
                      <i className="fas fa-shield-alt me-1"></i>
                      Admin Panel
                      {pendingRequests > 0 && (
                        <Badge 
                          bg="danger" 
                          pill 
                          className="position-absolute top-0 start-100 translate-middle"
                          style={{ fontSize: '0.6rem' }}
                        >
                          {pendingRequests}
                        </Badge>
                      )}
                    </Nav.Link>
                  </LinkContainer>
                )}
              </>
            )}
          </Nav>
          
          <Nav>
            {user ? (
              <NavDropdown 
                title={
                  <>
                    <i className="fas fa-user-circle me-1"></i>
                    {user.name}
                    {user.role === 'admin' && <Badge bg="primary" className="ms-1">Admin</Badge>}
                    {user.role === 'super_admin' && <Badge bg="warning" className="ms-1">Super Admin</Badge>}
                  </>
                } 
                id="user-dropdown"
              >
                <LinkContainer to="/profile">
                  <NavDropdown.Item>
                    <i className="fas fa-user me-2"></i>
                    Profile
                  </NavDropdown.Item>
                </LinkContainer>
                
                {(user.role === 'admin' || user.role === 'super_admin') && (
                  <>
                    <NavDropdown.Divider />
                    <LinkContainer to="/admin">
                      <NavDropdown.Item>
                        <i className="fas fa-shield-alt me-2"></i>
                        Admin Dashboard
                        {pendingRequests > 0 && (
                          <Badge bg="danger" className="ms-2">{pendingRequests}</Badge>
                        )}
                      </NavDropdown.Item>
                    </LinkContainer>
                    <NavDropdown.Item href="#" disabled className="small text-muted">
                      <i className="fas fa-info-circle me-2"></i>
                      Role: {user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </NavDropdown.Item>
                  </>
                )}
                
                <NavDropdown.Divider />
                
                <NavDropdown.Item onClick={handleLogout}>
                  <i className="fas fa-sign-out-alt me-2"></i>
                  Logout
                </NavDropdown.Item>
              </NavDropdown>
            ) : (
              <>
                <LinkContainer to="/login">
                  <Nav.Link>
                    <i className="fas fa-sign-in-alt me-1"></i>
                    Login
                  </Nav.Link>
                </LinkContainer>
                
                <LinkContainer to="/register">
                  <Nav.Link>
                    <i className="fas fa-user-plus me-1"></i>
                    Register
                  </Nav.Link>
                </LinkContainer>
              </>
            )}
          </Nav>
        </BootstrapNavbar.Collapse>
      </Container>
    </BootstrapNavbar>
  );
};

export default Navbar;