import React from 'react';
import './LoadingState.css';

function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="loading-state">
      <div className="loading">{message}</div>
    </div>
  );
}

export default LoadingState;

