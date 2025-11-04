import React, { useState, useEffect } from 'react';
import './AdminView.css';

function AdminView() {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState({});
  const [addingSeason, setAddingSeason] = useState(false);
  const [newSeason, setNewSeason] = useState('SPRING');
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  
  const [subgroups, setSubgroups] = useState([]);
  const [subgroupsLoading, setSubgroupsLoading] = useState(true);
  const [subgroupsError, setSubgroupsError] = useState(null);
  const [toggling, setToggling] = useState({});
  const [selectedSubgroups, setSelectedSubgroups] = useState(new Set());
  const [subgroupSearchQuery, setSubgroupSearchQuery] = useState('');
  const [subgroupStatusFilter, setSubgroupStatusFilter] = useState('enabled');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Alternative Titles state
  const [animeWithAltTitles, setAnimeWithAltTitles] = useState([]);
  const [altTitlesLoading, setAltTitlesLoading] = useState(true);
  const [expandedAnime, setExpandedAnime] = useState(new Set());
  const [editingTitle, setEditingTitle] = useState(null);
  const [editingAnimeId, setEditingAnimeId] = useState(null);
  const [newTitleText, setNewTitleText] = useState('');
  const [addingToAnimeId, setAddingToAnimeId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAddAnime, setShowAddAnime] = useState(false);
  const [animeSearchQuery, setAnimeSearchQuery] = useState('');
  const [animeSuggestions, setAnimeSuggestions] = useState([]);
  const [showAnimeAutocomplete, setShowAnimeAutocomplete] = useState(false);

  useEffect(() => {
    fetchSeasons();
    fetchSubgroups();
    fetchAllAlternativeTitles();
  }, []);

  const fetchSeasons = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/seasons');
      if (!response.ok) {
        throw new Error('Failed to fetch seasons data');
      }
      const data = await response.json();
      setSeasons(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching seasons:', err);
    } finally {
      setLoading(false);
    }
  };

  const addOrUpdateSeason = async (season, year, isAdding = false) => {
    const key = `${season}-${year}`;
    try {
      if (isAdding) {
        setAddingSeason(true);
      } else {
        setUpdating({ ...updating, [key]: true });
      }

      const response = await fetch('/api/admin/update-season', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ season, year }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update season');
      }

      const result = await response.json();
      alert(result.message || (isAdding ? 'Season added and data fetched successfully' : 'Season updated successfully'));
      
      // Refresh the seasons list to show updated timestamp
      await fetchSeasons();
      
      // Reset form if adding
      if (isAdding) {
        setNewSeason('SPRING');
        setNewYear(new Date().getFullYear());
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error updating season:', err);
    } finally {
      if (isAdding) {
        setAddingSeason(false);
      } else {
        setUpdating({ ...updating, [key]: false });
      }
    }
  };

  const updateSeason = async (season, year) => {
    await addOrUpdateSeason(season, year, false);
  };

  const handleAddSeason = async (e) => {
    e.preventDefault();
    await addOrUpdateSeason(newSeason, newYear, true);
  };

  const formatSeasonName = (season) => {
    return season.charAt(0) + season.slice(1).toLowerCase();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const fetchSubgroups = async () => {
    try {
      setSubgroupsLoading(true);
      setSubgroupsError(null);
      const response = await fetch('/api/admin/subgroups');
      if (!response.ok) {
        throw new Error('Failed to fetch subgroups data');
      }
      const data = await response.json();
      setSubgroups(data);
    } catch (err) {
      setSubgroupsError(err.message);
      console.error('Error fetching subgroups:', err);
    } finally {
      setSubgroupsLoading(false);
    }
  };

  const toggleSubgroup = async (ids, enabled) => {
    const idsArray = Array.isArray(ids) ? ids : [ids];
    
    try {
      // Set toggling state for all affected IDs
      const newToggling = { ...toggling };
      idsArray.forEach(id => {
        newToggling[id] = true;
      });
      setToggling(newToggling);

      const response = await fetch('/api/admin/subgroup/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: idsArray, enabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to toggle subgroups');
      }

      const result = await response.json();
      
      // Update local state for all affected subgroups
      setSubgroups(subgroups.map(sg => 
        idsArray.includes(sg.id) ? { ...sg, enabled } : sg
      ));
      
      // Clear selection after successful toggle
      setSelectedSubgroups(new Set());
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error toggling subgroups:', err);
    } finally {
      // Clear toggling state for all affected IDs
      const newToggling = { ...toggling };
      idsArray.forEach(id => {
        newToggling[id] = false;
      });
      setToggling(newToggling);
    }
  };

  const handleSelectSubgroup = (id) => {
    const newSelected = new Set(selectedSubgroups);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedSubgroups(newSelected);
  };

  const handleSelectAll = () => {
    const filteredSubgroups = getFilteredSubgroups();
    const filteredIds = filteredSubgroups.map(sg => sg.id);
    const allFilteredSelected = filteredIds.every(id => selectedSubgroups.has(id));
    
    if (allFilteredSelected) {
      // Deselect all filtered subgroups
      const newSelected = new Set(selectedSubgroups);
      filteredIds.forEach(id => newSelected.delete(id));
      setSelectedSubgroups(newSelected);
    } else {
      // Select all filtered subgroups
      const newSelected = new Set(selectedSubgroups);
      filteredIds.forEach(id => newSelected.add(id));
      setSelectedSubgroups(newSelected);
    }
  };

  const getFilteredSubgroups = () => {
    let filtered = subgroups;
    
    // Filter by status
    if (subgroupStatusFilter === 'enabled') {
      filtered = filtered.filter(sg => sg.enabled);
    } else if (subgroupStatusFilter === 'disabled') {
      filtered = filtered.filter(sg => !sg.enabled);
    }
    // 'all' means no status filtering
    
    // Filter by search query
    if (subgroupSearchQuery.trim()) {
      const query = subgroupSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(sg => 
        sg.name.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  const getAutocompleteSuggestions = () => {
    if (!subgroupSearchQuery.trim() || subgroupSearchQuery.length < 1) {
      return [];
    }
    const query = subgroupSearchQuery.toLowerCase().trim();
    const suggestions = subgroups
      .filter(sg => sg.name.toLowerCase().includes(query))
      .map(sg => sg.name)
      .slice(0, 10); // Limit to 10 suggestions
    return suggestions;
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSubgroupSearchQuery(value);
    setShowAutocomplete(value.trim().length > 0);
    setHighlightedIndex(-1);
  };

  const handleSuggestionClick = (suggestion) => {
    setSubgroupSearchQuery(suggestion);
    setShowAutocomplete(false);
    setHighlightedIndex(-1);
  };

  const handleSearchKeyDown = (e) => {
    const suggestions = getAutocompleteSuggestions();
    
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

  const handleSearchBlur = () => {
    // Delay hiding to allow click events on suggestions
    setTimeout(() => {
      setShowAutocomplete(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  const handleSearchFocus = () => {
    if (subgroupSearchQuery.trim().length > 0) {
      setShowAutocomplete(true);
    }
  };

  // Alternative Titles handlers
  const fetchAllAlternativeTitles = async () => {
    try {
      setAltTitlesLoading(true);
      const response = await fetch('/api/admin/alternative-titles/all');
      if (!response.ok) {
        throw new Error('Failed to fetch alternative titles');
      }
      const data = await response.json();
      setAnimeWithAltTitles(data);
      // Expand all by default
      setExpandedAnime(new Set(data.map(a => a.id)));
    } catch (err) {
      console.error('Error fetching alternative titles:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setAltTitlesLoading(false);
    }
  };

  const toggleAnimeExpand = (animeId) => {
    const newExpanded = new Set(expandedAnime);
    if (newExpanded.has(animeId)) {
      newExpanded.delete(animeId);
    } else {
      newExpanded.add(animeId);
    }
    setExpandedAnime(newExpanded);
  };

  const handleAddTitle = (animeId) => {
    setAddingToAnimeId(animeId);
    setEditingTitle(null);
    setEditingAnimeId(null);
    setNewTitleText('');
  };

  const handleEditTitle = (animeId, title) => {
    setEditingTitle(title);
    setEditingAnimeId(animeId);
    setAddingToAnimeId(null);
    setNewTitleText(title.title);
  };

  const handleSaveTitle = async (animeId) => {
    if (!animeId || !newTitleText.trim()) {
      alert('Please enter a title');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/admin/alternative-titles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animeId: animeId,
          title: newTitleText.trim(),
          id: editingTitle ? editingTitle.id : undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save alternative title');
      }

      // Refresh all alternative titles
      await fetchAllAlternativeTitles();
      setEditingTitle(null);
      setEditingAnimeId(null);
      setAddingToAnimeId(null);
      setNewTitleText('');
      
      // If this was a newly added anime (not in the list yet), ensure it's expanded
      const newExpanded = new Set(expandedAnime);
      newExpanded.add(animeId);
      setExpandedAnime(newExpanded);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTitle = async (id, animeId) => {
    if (!confirm('Are you sure you want to delete this alternative title?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/alternative-titles/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete alternative title');
      }

      // Refresh all alternative titles
      await fetchAllAlternativeTitles();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingTitle(null);
    setEditingAnimeId(null);
    setAddingToAnimeId(null);
    setNewTitleText('');
  };

  // Add new anime handlers
  const searchAnimeForAdd = async (query) => {
    if (!query || query.trim().length < 1) {
      setAnimeSuggestions([]);
      setShowAnimeAutocomplete(false);
      return;
    }

    try {
      const response = await fetch(`/api/admin/anime/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('Failed to search anime');
      }
      const data = await response.json();
      // Filter out anime that are already in the list
      const existingIds = new Set(animeWithAltTitles.map(a => a.id));
      const filtered = data.filter(a => !existingIds.has(a.id));
      setAnimeSuggestions(filtered);
      setShowAnimeAutocomplete(filtered.length > 0);
    } catch (err) {
      console.error('Error searching anime:', err);
      setAnimeSuggestions([]);
      setShowAnimeAutocomplete(false);
    }
  };

  const handleAnimeSearchChange = (e) => {
    const value = e.target.value;
    setAnimeSearchQuery(value);
    searchAnimeForAdd(value);
  };

  const handleAnimeSelect = (anime) => {
    // Check if anime already exists in the list
    const existingIndex = animeWithAltTitles.findIndex(a => a.id === anime.id);
    
    if (existingIndex === -1) {
      // Add new anime to the list with empty alternative titles
      const newAnime = {
        id: anime.id,
        title: anime.title,
        titleRomaji: anime.titleRomaji,
        titleEnglish: anime.titleEnglish,
        titleNative: anime.titleNative,
        alternativeTitles: []
      };
      
      setAnimeWithAltTitles([...animeWithAltTitles, newAnime].sort((a, b) => 
        a.title.localeCompare(b.title)
      ));
      
      // Expand the new anime and set it up for adding a title
      const newExpanded = new Set(expandedAnime);
      newExpanded.add(anime.id);
      setExpandedAnime(newExpanded);
      setAddingToAnimeId(anime.id);
    } else {
      // Anime already exists, just expand it
      const newExpanded = new Set(expandedAnime);
      newExpanded.add(anime.id);
      setExpandedAnime(newExpanded);
      setAddingToAnimeId(anime.id);
    }
    
    // Clear search
    setAnimeSearchQuery('');
    setAnimeSuggestions([]);
    setShowAnimeAutocomplete(false);
    setShowAddAnime(false);
  };

  const handleShowAddAnime = () => {
    setShowAddAnime(true);
    setAnimeSearchQuery('');
    setAnimeSuggestions([]);
  };

  const handleCancelAddAnime = () => {
    setShowAddAnime(false);
    setAnimeSearchQuery('');
    setAnimeSuggestions([]);
    setShowAnimeAutocomplete(false);
  };

  const handleBulkEnable = () => {
    if (selectedSubgroups.size === 0) {
      alert('Please select at least one subgroup');
      return;
    }
    toggleSubgroup(Array.from(selectedSubgroups), true);
  };

  const handleBulkDisable = () => {
    if (selectedSubgroups.size === 0) {
      alert('Please select at least one subgroup');
      return;
    }
    toggleSubgroup(Array.from(selectedSubgroups), false);
  };

  if (loading) {
    return (
      <div className="admin-view">
        <div className="admin-container">
          <h1 className="admin-title">Admin Panel</h1>
          <div className="loading">Loading seasons data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-view">
        <div className="admin-container">
          <h1 className="admin-title">Admin Panel</h1>
          <div className="error">
            <p>Error: {error}</p>
            <button onClick={fetchSeasons} className="retry-button">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-view">
      <div className="admin-container">
        <h1 className="admin-title">Admin Panel</h1>
        <p className="admin-subtitle">Manage Anime Data Updates</p>
        
        {/* Seasons Section */}
        <div className="table-container">
          <h3 className="section-title">Seasons</h3>
          
          {/* Add New Season Form */}
          <div className="add-season-form-container">
            <h4 className="add-season-title">Add New Season</h4>
            <form onSubmit={handleAddSeason} className="add-season-form">
              <div className="form-group">
                <label htmlFor="season-select">Season:</label>
                <select
                  id="season-select"
                  value={newSeason}
                  onChange={(e) => setNewSeason(e.target.value)}
                  className="season-select"
                  disabled={addingSeason}
                  required
                >
                  <option value="WINTER">Winter</option>
                  <option value="SPRING">Spring</option>
                  <option value="SUMMER">Summer</option>
                  <option value="FALL">Fall</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="year-input">Year:</label>
                <input
                  id="year-input"
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(parseInt(e.target.value) || new Date().getFullYear())}
                  className="year-input"
                  min="2000"
                  max={new Date().getFullYear() + 10}
                  disabled={addingSeason}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={addingSeason}
                className={`add-season-button ${addingSeason ? 'adding' : ''}`}
              >
                {addingSeason ? 'Adding & Fetching...' : 'Add Season & Fetch Data'}
              </button>
            </form>
          </div>

          {/* Seasons Table */}
          {seasons.length === 0 ? (
            <div className="no-data">No seasons data found.</div>
          ) : (
            <table className="seasons-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Year</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((item, index) => {
                  const key = `${item.season}-${item.year}`;
                  const isUpdating = updating[key] || false;
                  return (
                    <tr key={index}>
                      <td>{formatSeasonName(item.season)}</td>
                      <td>{item.year}</td>
                      <td>{formatDate(item.lastFetched)}</td>
                      <td>
                        <button
                          onClick={() => updateSeason(item.season, item.year)}
                          disabled={isUpdating}
                          className={`update-button ${isUpdating ? 'updating' : ''}`}
                        >
                          {isUpdating ? 'Updating...' : 'Update'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Section Separator */}
        <div className="section-separator"></div>

        {/* Subgroups Section */}
        <div className="table-container">
          <div className="section-header">
            <h3 className="section-title">Subgroups</h3>
            {!subgroupsLoading && !subgroupsError && subgroups.length > 0 && selectedSubgroups.size > 0 && (
              <div className="bulk-actions">
                <button
                  onClick={handleBulkEnable}
                  className="bulk-button enable-button"
                  disabled={Object.values(toggling).some(t => t)}
                >
                  Enable Selected ({selectedSubgroups.size})
                </button>
                <button
                  onClick={handleBulkDisable}
                  className="bulk-button disable-button"
                  disabled={Object.values(toggling).some(t => t)}
                >
                  Disable Selected ({selectedSubgroups.size})
                </button>
              </div>
            )}
          </div>
          {!subgroupsLoading && !subgroupsError && subgroups.length > 0 && (
            <>
              <div className="subgroups-filters">
                <div className="status-filter-group">
                  <label className="filter-label">Filter by status:</label>
                  <div className="status-filter-options">
                    <label className="status-filter-option">
                      <input
                        type="radio"
                        name="subgroupStatusFilter"
                        value="enabled"
                        checked={subgroupStatusFilter === 'enabled'}
                        onChange={(e) => setSubgroupStatusFilter(e.target.value)}
                      />
                      <span>Enabled</span>
                    </label>
                    <label className="status-filter-option">
                      <input
                        type="radio"
                        name="subgroupStatusFilter"
                        value="disabled"
                        checked={subgroupStatusFilter === 'disabled'}
                        onChange={(e) => setSubgroupStatusFilter(e.target.value)}
                      />
                      <span>Disabled</span>
                    </label>
                    <label className="status-filter-option">
                      <input
                        type="radio"
                        name="subgroupStatusFilter"
                        value="all"
                        checked={subgroupStatusFilter === 'all'}
                        onChange={(e) => setSubgroupStatusFilter(e.target.value)}
                      />
                      <span>All</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="search-container">
                <div className={`search-input-wrapper ${showAutocomplete && getAutocompleteSuggestions().length > 0 ? 'has-autocomplete' : ''}`}>
                  <input
                    type="text"
                    placeholder="Search subgroups..."
                    value={subgroupSearchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    onBlur={handleSearchBlur}
                    onFocus={handleSearchFocus}
                    className="search-input"
                  />
                  {showAutocomplete && getAutocompleteSuggestions().length > 0 && (
                    <div className="autocomplete-dropdown">
                      {getAutocompleteSuggestions().map((suggestion, index) => (
                        <div
                          key={suggestion}
                          className={`autocomplete-item ${index === highlightedIndex ? 'highlighted' : ''}`}
                          onClick={() => handleSuggestionClick(suggestion)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                        >
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {subgroupsLoading ? (
            <div className="loading">Loading subgroups...</div>
          ) : subgroupsError ? (
            <div className="error">
              <p>Error: {subgroupsError}</p>
              <button onClick={fetchSubgroups} className="retry-button">
                Retry
              </button>
            </div>
          ) : subgroups.length === 0 ? (
            <div className="no-data">No subgroups found.</div>
          ) : (
            <div className="table-wrapper">
              <table className="seasons-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>
                      <input
                        type="checkbox"
                        checked={(() => {
                          const filtered = getFilteredSubgroups();
                          return filtered.length > 0 && filtered.every(sg => selectedSubgroups.has(sg.id));
                        })()}
                        onChange={handleSelectAll}
                        className="checkbox-input"
                      />
                    </th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {getFilteredSubgroups().map((subgroup) => {
                    const isToggling = toggling[subgroup.id] || false;
                    const isSelected = selectedSubgroups.has(subgroup.id);
                    return (
                      <tr key={subgroup.id} className={isSelected ? 'selected-row' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectSubgroup(subgroup.id)}
                            className="checkbox-input"
                            disabled={isToggling}
                          />
                        </td>
                        <td>{subgroup.name}</td>
                        <td>
                          <span className={`status-badge ${subgroup.enabled ? 'enabled' : 'disabled'}`}>
                            {subgroup.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => toggleSubgroup(subgroup.id, !subgroup.enabled)}
                            disabled={isToggling}
                            className={`toggle-button ${subgroup.enabled ? 'disable' : 'enable'} ${isToggling ? 'toggling' : ''}`}
                          >
                            {isToggling 
                              ? 'Updating...' 
                              : subgroup.enabled 
                              ? 'Disable' 
                              : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {getFilteredSubgroups().length === 0 && subgroupSearchQuery.trim() && (
                <div className="no-results">No subgroups match your search.</div>
              )}
            </div>
          )}
        </div>

        {/* Section Separator */}
        <div className="section-separator"></div>

        {/* Alternative Titles Section */}
        <div className="table-container">
          <div className="section-header">
            <h3 className="section-title">Alternative Titles</h3>
            {!altTitlesLoading && (
              <button
                onClick={handleShowAddAnime}
                className="add-anime-button"
                disabled={showAddAnime || editingTitle !== null}
              >
                + Add Anime
              </button>
            )}
          </div>
          
          {/* Add Anime Search */}
          {showAddAnime && (
            <div className="add-anime-container">
              <div className="search-container">
                <div className="search-input-wrapper">
                  <input
                    type="text"
                    placeholder="Search anime to add..."
                    value={animeSearchQuery}
                    onChange={handleAnimeSearchChange}
                    onBlur={() => setTimeout(() => setShowAnimeAutocomplete(false), 200)}
                    onFocus={() => {
                      if (animeSuggestions.length > 0) {
                        setShowAnimeAutocomplete(true);
                      }
                    }}
                    className="search-input"
                    autoFocus
                  />
                  {showAnimeAutocomplete && animeSuggestions.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {animeSuggestions.map((anime) => (
                        <div
                          key={anime.id}
                          className="autocomplete-item"
                          onClick={() => handleAnimeSelect(anime)}
                        >
                          <div className="anime-suggestion">
                            <span className="anime-title">{anime.title}</span>
                            {anime.titleRomaji && anime.titleRomaji !== anime.title && (
                              <span className="anime-subtitle">{anime.titleRomaji}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleCancelAddAnime}
                className="cancel-button-small"
              >
                Cancel
              </button>
            </div>
          )}
          
          {altTitlesLoading ? (
            <div className="loading">Loading alternative titles...</div>
          ) : animeWithAltTitles.length === 0 ? (
            <div className="no-data">
              No alternative titles configured yet.
              {!showAddAnime && (
                <button
                  onClick={handleShowAddAnime}
                  className="add-anime-button-inline"
                >
                  Add your first anime
                </button>
              )}
            </div>
          ) : (
            <div className="anime-list-hierarchical">
              {animeWithAltTitles.map((anime) => {
                const isExpanded = expandedAnime.has(anime.id);
                const isAdding = addingToAnimeId === anime.id;
                const isEditingThisAnime = editingAnimeId === anime.id;
                
                return (
                  <div key={anime.id} className="anime-row">
                    <div className="anime-row-header" onClick={() => toggleAnimeExpand(anime.id)}>
                      <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                      <span className="anime-row-title">{anime.title}</span>
                      <span className="anime-row-count">({anime.alternativeTitles.length} title{anime.alternativeTitles.length !== 1 ? 's' : ''})</span>
                    </div>
                    
                    {isExpanded && (
                      <div className="anime-row-content">
                        {/* Add/Edit Form */}
                        {(isAdding || isEditingThisAnime) && (
                          <div className="alt-title-form-inline">
                            <input
                              type="text"
                              placeholder={editingTitle ? "Edit alternative title..." : "Enter alternative title..."}
                              value={newTitleText}
                              onChange={(e) => setNewTitleText(e.target.value)}
                              className="alt-title-input"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveTitle(anime.id);
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit();
                                }
                              }}
                              autoFocus
                            />
                            <div className="alt-title-actions-inline">
                              <button
                                onClick={() => handleSaveTitle(anime.id)}
                                disabled={saving || !newTitleText.trim()}
                                className="save-button-small"
                              >
                                {saving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={saving}
                                className="cancel-button-small"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        
                        {/* Alternative Titles List */}
                        {anime.alternativeTitles.length === 0 && !isAdding && !isEditingThisAnime ? (
                          <div className="no-alt-titles">No alternative titles. Click "Add Title" to add one.</div>
                        ) : (
                          <div className="alt-titles-list-nested">
                            {anime.alternativeTitles.map((title) => {
                              const isEditingThis = editingTitle && editingTitle.id === title.id;
                              return (
                                <div key={title.id} className="alt-title-item-nested">
                                  {isEditingThis ? (
                                    <div className="alt-title-form-inline">
                                      <input
                                        type="text"
                                        value={newTitleText}
                                        onChange={(e) => setNewTitleText(e.target.value)}
                                        className="alt-title-input"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveTitle(anime.id);
                                          } else if (e.key === 'Escape') {
                                            handleCancelEdit();
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <div className="alt-title-actions-inline">
                                        <button
                                          onClick={() => handleSaveTitle(anime.id)}
                                          disabled={saving || !newTitleText.trim()}
                                          className="save-button-small"
                                        >
                                          {saving ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                          onClick={handleCancelEdit}
                                          disabled={saving}
                                          className="cancel-button-small"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="alt-title-text">{title.title}</span>
                                      <div className="alt-title-actions-inline">
                                        <button
                                          onClick={() => handleEditTitle(anime.id, title)}
                                          className="edit-button-small"
                                          disabled={editingTitle !== null || isAdding}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => handleDeleteTitle(title.id, anime.id)}
                                          className="delete-button-small"
                                          disabled={editingTitle !== null || isAdding}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Add Title Button */}
                        {!isAdding && !isEditingThisAnime && (
                          <button
                            onClick={() => handleAddTitle(anime.id)}
                            className="add-title-button"
                            disabled={editingTitle !== null}
                          >
                            + Add Title
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminView;

