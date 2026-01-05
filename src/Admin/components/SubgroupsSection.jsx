import React, { useState, useEffect } from 'react';
import SearchInput from './SearchInput';
import './SubgroupsSection.css';

function SubgroupsSection() {
  const [subgroups, setSubgroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingDefaults, setUpdatingDefaults] = useState({});

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
      setUpdatingDefaults({});
    } catch (err) {
      setError(err.message);
      console.error('Error fetching subgroups:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredSubgroups = () => {
    if (!searchQuery.trim()) {
      return subgroups;
    }

    const query = searchQuery.toLowerCase().trim();
    return subgroups.filter((sg) => sg.name.toLowerCase().includes(query));
  };

  const getAutocompleteSuggestions = () => {
    if (!searchQuery.trim() || searchQuery.length < 1) {
      return [];
    }

    const query = searchQuery.toLowerCase().trim();
    return subgroups
      .filter((sg) => sg.name.toLowerCase().includes(query))
      .map((sg) => sg.name)
      .slice(0, 10);
  };

  const filteredSubgroups = getFilteredSubgroups();
  const suggestions = getAutocompleteSuggestions();

  const handleDefaultToggle = async (subgroupId, defaultEnabled) => {
    if (!subgroupId || updatingDefaults[subgroupId]) {
      return;
    }

    setUpdatingDefaults((prev) => ({ ...prev, [subgroupId]: true }));

    try {
      const response = await fetch(`/api/admin/subgroups/${subgroupId}/default-enabled`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ defaultEnabled }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update default state');
      }

      setSubgroups((prev) =>
        prev.map((subgroup) =>
          subgroup.id === subgroupId
            ? { ...subgroup, defaultEnabled: result.defaultEnabled }
            : subgroup
        )
      );
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error updating subgroup default state:', err);
    } finally {
      setUpdatingDefaults((prev) => {
        const next = { ...prev };
        delete next[subgroupId];
        return next;
      });
    }
  };

  return (
    <div className="table-container">
      <div className="section-header">
        <h3 className="section-title">Subgroups</h3>
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
                  <th>Name</th>
                  <th>Default</th>
                  <th>AniDB ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubgroups.map((subgroup) => (
                  <tr key={subgroup.id}>
                    <td className="subgroup-name-cell">
                      <span
                        className={`subgroup-status-icon ${
                          subgroup.defaultEnabled ? 'enabled' : 'disabled'
                        }`}
                        aria-hidden="true"
                      >
                        {subgroup.defaultEnabled ? (
                          <svg viewBox="0 0 16 16" focusable="false">
                            <path d="M2.5 8.5l3.5 3.5 7-7" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 16 16" focusable="false">
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        )}
                      </span>
                      <span>{subgroup.name}</span>
                    </td>
                    <td>
                      <div className="default-enabled-actions">
                        <button
                          type="button"
                          className="default-toggle-button enable"
                          onClick={() => handleDefaultToggle(subgroup.id, true)}
                          disabled={
                            updatingDefaults[subgroup.id] || subgroup.defaultEnabled
                          }
                        >
                          Enable
                        </button>
                        <button
                          type="button"
                          className="default-toggle-button disable"
                          onClick={() => handleDefaultToggle(subgroup.id, false)}
                          disabled={
                            updatingDefaults[subgroup.id] || !subgroup.defaultEnabled
                          }
                        >
                          Disable
                        </button>
                      </div>
                    </td>
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
                  </tr>
                ))}
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

