import React, { useState, useEffect } from 'react';
import SearchInput from './SearchInput';
import './SubgroupsSection.css';

function SubgroupsSection() {
  const [subgroups, setSubgroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState({});
  const [selectedSubgroups, setSelectedSubgroups] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('enabled');

  useEffect(() => {
    fetchSubgroups();
  }, []);

  const fetchSubgroups = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/subgroups');
      if (!response.ok) {
        throw new Error('Failed to fetch subgroups data');
      }
      const data = await response.json();
      setSubgroups(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching subgroups:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSubgroup = async (ids, enabled) => {
    const idsArray = Array.isArray(ids) ? ids : [ids];
    
    try {
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

      setSubgroups(subgroups.map(sg => 
        idsArray.includes(sg.id) ? { ...sg, enabled } : sg
      ));
      
      setSelectedSubgroups(new Set());
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error toggling subgroups:', err);
    } finally {
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
      const newSelected = new Set(selectedSubgroups);
      filteredIds.forEach(id => newSelected.delete(id));
      setSelectedSubgroups(newSelected);
    } else {
      const newSelected = new Set(selectedSubgroups);
      filteredIds.forEach(id => newSelected.add(id));
      setSelectedSubgroups(newSelected);
    }
  };

  const getFilteredSubgroups = () => {
    let filtered = subgroups;
    
    if (statusFilter === 'enabled') {
      filtered = filtered.filter(sg => sg.enabled);
    } else if (statusFilter === 'disabled') {
      filtered = filtered.filter(sg => !sg.enabled);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(sg => 
        sg.name.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  const getAutocompleteSuggestions = () => {
    if (!searchQuery.trim() || searchQuery.length < 1) {
      return [];
    }
    const query = searchQuery.toLowerCase().trim();
    return subgroups
      .filter(sg => sg.name.toLowerCase().includes(query))
      .map(sg => sg.name)
      .slice(0, 10);
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

  const filteredSubgroups = getFilteredSubgroups();
  const suggestions = getAutocompleteSuggestions();

  return (
    <div className="table-container">
      <div className="section-header">
        <h3 className="section-title">Subgroups</h3>
        {!loading && !error && subgroups.length > 0 && selectedSubgroups.size > 0 && (
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
      
      {loading ? (
        <div className="loading">Loading subgroups...</div>
      ) : error ? (
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={fetchSubgroups} className="retry-button">
            Retry
          </button>
        </div>
      ) : subgroups.length === 0 ? (
        <div className="no-data">No subgroups found.</div>
      ) : (
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
                    checked={statusFilter === 'enabled'}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  />
                  <span>Enabled</span>
                </label>
                <label className="status-filter-option">
                  <input
                    type="radio"
                    name="subgroupStatusFilter"
                    value="disabled"
                    checked={statusFilter === 'disabled'}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  />
                  <span>Disabled</span>
                </label>
                <label className="status-filter-option">
                  <input
                    type="radio"
                    name="subgroupStatusFilter"
                    value="all"
                    checked={statusFilter === 'all'}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  />
                  <span>All</span>
                </label>
              </div>
            </div>
          </div>
          <div className="search-container">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search subgroups..."
              suggestions={suggestions}
              onSuggestionSelect={(suggestion) => setSearchQuery(suggestion)}
            />
          </div>
          <div className="table-wrapper">
            <table className="seasons-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>
                    <input
                      type="checkbox"
                      checked={filteredSubgroups.length > 0 && filteredSubgroups.every(sg => selectedSubgroups.has(sg.id))}
                      onChange={handleSelectAll}
                      className="checkbox-input"
                    />
                  </th>
                  <th>Name</th>
                  <th>AniDB ID</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubgroups.map((subgroup) => {
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
                        {subgroup.anidbID ? (
                          <a 
                            href={`https://anidb.net/group/${subgroup.anidbID}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="anidb-link"
                          >
                            {subgroup.anidbID}
                          </a>
                        ) : (
                          <span className="no-anidb">—</span>
                        )}
                      </td>
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
            {filteredSubgroups.length === 0 && searchQuery.trim() && (
              <div className="no-results">No subgroups match your search.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default SubgroupsSection;

