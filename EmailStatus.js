import React, { useState, useEffect } from 'react';
import { Card, Badge, Button, Alert, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { toast } from 'react-toastify';

const EmailStatus = () => {
  const [emailStatus, setEmailStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchEmailStatus();
  }, []);

  const fetchEmailStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/email/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setEmailStatus(response.data.email);
    } catch (error) {
      console.error('Failed to fetch email status:', error);
      setEmailStatus({
        configured: false,
        error: 'Failed to check email status'
      });
    } finally {
      setLoading(false);
    }
  };

  const testEmail = async () => {
    setTesting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/test/email', 
        { type: 'welcome' },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data.success) {
        toast.success('Test email sent successfully!');
      } else {
        toast.error(`Failed to send test email: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Test email failed:', error);
      toast.error('Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0">📧 Email Service Status</h5>
        </Card.Header>
        <Card.Body className="text-center">
          <Spinner animation="border" size="sm" /> Loading...
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h5 className="mb-0">📧 Email Service Status</h5>
        <Badge bg={emailStatus?.configured ? 'success' : 'warning'}>
          {emailStatus?.configured ? 'Configured' : 'Not Configured'}
        </Badge>
      </Card.Header>
      <Card.Body>
        {emailStatus?.configured ? (
          <div>
            <Alert variant="success" className="mb-3">
              <strong>✅ Email service is properly configured!</strong>
              <br />
              Provider: {emailStatus.provider || 'Gmail'}
              <br />
              User: {emailStatus.user}
            </Alert>
            
            <div className="d-flex gap-2">
              <Button 
                variant="outline-primary" 
                size="sm" 
                onClick={testEmail}
                disabled={testing}
              >
                {testing ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Sending...
                  </>
                ) : (
                  'Send Test Email'
                )}
              </Button>
              
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={fetchEmailStatus}
              >
                Refresh Status
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Alert variant="warning" className="mb-3">
              <strong>⚠️ Email service needs configuration</strong>
              <br />
              {emailStatus?.error || 'Email credentials not configured'}
            </Alert>
            
            <div className="mb-3">
              <h6>Quick Setup:</h6>
              <ol className="small">
                <li>Update <code>EMAIL_USER</code> and <code>EMAIL_PASSWORD</code> in <code>.env</code> file</li>
                <li>For Gmail: Use App Password (enable 2FA first)</li>
                <li>Restart the server</li>
                <li>Click "Refresh Status" to verify</li>
              </ol>
            </div>
            
            <div className="d-flex gap-2">
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={fetchEmailStatus}
              >
                Refresh Status
              </Button>
              
              <Button 
                variant="outline-info" 
                size="sm" 
                href="/EMAIL_SERVICE_GUIDE.md"
                target="_blank"
              >
                Setup Guide
              </Button>
            </div>
          </div>
        )}
        
        <div className="mt-3 pt-3 border-top">
          <small className="text-muted">
            <strong>Email Features:</strong> Welcome emails, booking confirmations, 
            reminders, cancellation notices, and payment confirmations.
          </small>
        </div>
      </Card.Body>
    </Card>
  );
};

export default EmailStatus;