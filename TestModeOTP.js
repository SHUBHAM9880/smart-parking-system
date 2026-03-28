import React, { useState } from 'react';
import { Alert, Button, Card } from 'react-bootstrap';

const TestModeOTP = ({ 
  otp, 
  email, 
  type, 
  onUseOTP, 
  displayMessage,
  className = '' 
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyOTP = () => {
    navigator.clipboard.writeText(otp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleUseOTP = () => {
    if (onUseOTP) {
      onUseOTP(otp);
    }
  };

  if (!otp) return null;

  return (
    <Card className={`border-warning ${className}`}>
      <Card.Header className="bg-warning text-dark">
        <h6 className="mb-0">
          <i className="fas fa-flask me-2"></i>
          Test Mode - OTP Available
        </h6>
      </Card.Header>
      <Card.Body>
        <Alert variant="info" className="mb-3">
          <div className="d-flex align-items-center justify-content-between">
            <div>
              <strong>📧 Email:</strong> {email}<br />
              <strong>🔐 Your OTP:</strong> 
              <span className="fs-4 fw-bold text-primary ms-2">{otp}</span>
            </div>
            <div className="d-flex flex-column gap-2">
              <Button 
                variant="outline-primary" 
                size="sm"
                onClick={handleCopyOTP}
              >
                <i className={`fas ${copied ? 'fa-check' : 'fa-copy'} me-1`}></i>
                {copied ? 'Copied!' : 'Copy OTP'}
              </Button>
              {onUseOTP && (
                <Button 
                  variant="success" 
                  size="sm"
                  onClick={handleUseOTP}
                >
                  <i className="fas fa-magic me-1"></i>
                  Auto-fill OTP
                </Button>
              )}
            </div>
          </div>
        </Alert>

        <div className="small text-muted">
          <p className="mb-2">
            <i className="fas fa-info-circle me-1"></i>
            <strong>Test Mode:</strong> In production, this OTP would be sent to your email address.
          </p>
          <p className="mb-0">
            <i className="fas fa-clock me-1"></i>
            This code expires in 10 minutes and allows 3 verification attempts.
          </p>
        </div>

        {displayMessage && (
          <Alert variant="secondary" className="mt-3 mb-0 small">
            {displayMessage}
          </Alert>
        )}
      </Card.Body>
    </Card>
  );
};

export default TestModeOTP;