import React, { useState } from 'react';
import { Card, Alert, Button, Form, Modal } from 'react-bootstrap';

const EmailConfig = () => {
  const [showModal, setShowModal] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkEmailStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/email/status');
      const data = await response.json();
      setEmailStatus(data.email);
    } catch (error) {
      console.error('Failed to check email status:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    checkEmailStatus();
  }, []);

  const handleShowConfig = () => {
    setShowModal(true);
  };

  const handleCloseConfig = () => {
    setShowModal(false);
  };

  if (!emailStatus) {
    return (
      <Card className="border-info">
        <Card.Body className="text-center">
          <Button variant="outline-info" onClick={checkEmailStatus} disabled={loading}>
            {loading ? 'Checking...' : 'Check Email Status'}
          </Button>
        </Card.Body>
      </Card>
    );
  }

  return (
    <>
      <Card className={`border-${emailStatus.configured ? 'success' : 'warning'}`}>
        <Card.Header className={`bg-${emailStatus.configured ? 'success' : 'warning'} text-${emailStatus.configured ? 'white' : 'dark'}`}>
          <h6 className="mb-0">
            <i className={`fas ${emailStatus.configured ? 'fa-check-circle' : 'fa-exclamation-triangle'} me-2`}></i>
            Email Service Status
          </h6>
        </Card.Header>
        <Card.Body>
          <div className="mb-3">
            <strong>Status:</strong> {emailStatus.configured ? 'Configured' : 'Test Mode'}
            <br />
            <strong>Provider:</strong> {emailStatus.provider}
            <br />
            <strong>User:</strong> {emailStatus.user}
          </div>

          {!emailStatus.configured && (
            <Alert variant="warning" className="mb-3">
              <h6>🧪 Currently in Test Mode</h6>
              <p className="mb-2">
                OTP codes are displayed in the browser instead of being sent via email.
                This is perfect for development and testing.
              </p>
              <p className="mb-0">
                To enable real email sending, you need to configure Gmail App Password.
              </p>
            </Alert>
          )}

          {emailStatus.configured && (
            <Alert variant="success" className="mb-3">
              <h6>✅ Real Email Sending Enabled</h6>
              <p className="mb-0">
                OTP codes will be sent to users' actual email addresses.
              </p>
            </Alert>
          )}

          <div className="d-flex gap-2">
            <Button 
              variant={emailStatus.configured ? 'outline-success' : 'warning'}
              size="sm"
              onClick={handleShowConfig}
            >
              <i className="fas fa-cog me-1"></i>
              {emailStatus.configured ? 'View Config' : 'Setup Real Email'}
            </Button>
            <Button 
              variant="outline-secondary" 
              size="sm"
              onClick={checkEmailStatus}
              disabled={loading}
            >
              <i className="fas fa-sync me-1"></i>
              Refresh Status
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Configuration Modal */}
      <Modal show={showModal} onHide={handleCloseConfig} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <i className="fas fa-envelope-open-text me-2"></i>
            Email Service Configuration
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info">
            <h6>📧 How to Enable Real Email Sending</h6>
            <p>To send real OTP emails, you need to configure Gmail App Password:</p>
          </Alert>

          <div className="mb-4">
            <h6>🔧 Setup Steps:</h6>
            <ol>
              <li><strong>Enable 2-Factor Authentication</strong> on your Gmail account</li>
              <li><strong>Generate App Password:</strong>
                <ul>
                  <li>Go to Google Account settings</li>
                  <li>Security → 2-Step Verification → App passwords</li>
                  <li>Generate password for "Mail"</li>
                </ul>
              </li>
              <li><strong>Update .env file:</strong></li>
            </ol>
          </div>

          <Card className="bg-light">
            <Card.Body>
              <h6>📝 .env Configuration:</h6>
              <pre className="mb-0">
{`# Change from test to gmail
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-character-app-password

# Remove test mode
# EMAIL_SERVICE=test`}
              </pre>
            </Card.Body>
          </Card>

          <Alert variant="warning" className="mt-3">
            <h6>⚠️ Important Notes:</h6>
            <ul className="mb-0">
              <li>Never use your regular Gmail password</li>
              <li>Use the 16-character App Password generated by Google</li>
              <li>Restart the server after updating .env</li>
              <li>Test mode is perfect for development - no real emails needed</li>
            </ul>
          </Alert>

          <Alert variant="success" className="mt-3">
            <h6>✅ Test Mode Benefits:</h6>
            <ul className="mb-0">
              <li>No email configuration required</li>
              <li>OTP codes displayed directly to users</li>
              <li>Perfect for development and testing</li>
              <li>No risk of sending spam emails during testing</li>
            </ul>
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseConfig}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default EmailConfig;