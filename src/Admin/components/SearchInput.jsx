import React, { useState } from 'react';
import './SearchInput.css';

function SearchInput({ 
  value, 
  onChange, 
  placeholder = "Search...", 
  suggestions = [], 
  onSuggestionSelect,
  renderSuggestion = (suggestion) => suggestion
}) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const handleChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowAutocomplete(newValue.trim().length > 0 && suggestions.length > 0);
    setHighlightedIndex(-1);
  };

  const handleSuggestionClick = (suggestion) => {
    onSuggestionSelect?.(suggestion);
    setShowAutocomplete(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowAutocomplete(true);
      setHighlightedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleSuggestionClick(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
      setHighlightedIndex(-1);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowAutocomplete(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  const handleFocus = () => {
    if (value.trim().length > 0 && suggestions.length > 0) {
      setShowAutocomplete(true);
    }
  };

  const hasAutocomplete = showAutocomplete && suggestions.length > 0;

  return (
    <div className={`search-input-wrapper ${hasAutocomplete ? 'has-autocomplete' : ''}`}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        className="search-input"
      />
      {hasAutocomplete && (
        <div className="autocomplete-dropdown">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className={`autocomplete-item ${index === highlightedIndex ? 'highlighted' : ''}`}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {renderSuggestion(suggestion)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchInput;

