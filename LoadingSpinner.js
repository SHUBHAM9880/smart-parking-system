import React from 'react';
import { Spinner, Container, Row, Col } from 'react-bootstrap';

const LoadingSpinner = ({ message = 'Loading...' }) => {
  return (
    <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
      <Row>
        <Col className="text-center">
          <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
          <div className="mt-3">
            <h5>{message}</h5>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default LoadingSpinner;