import React from 'react';
import './ErrorState.css';

function ErrorState({ error, onRetry, retryLabel = 'Retry' }) {
  return (
    <div className="error-state">
      <div className="error">
        <p>Error: {error}</p>
        {onRetry && (
          <button onClick={onRetry} className="retry-button">
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorState;

