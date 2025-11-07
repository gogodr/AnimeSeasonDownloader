import React, { useState, useEffect } from 'react';
import SearchInput from './SearchInput';
import './SubgroupsSection.css';

function SubgroupsSection() {
  const [subgroups, setSubgroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

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
                  <th>AniDB ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubgroups.map((subgroup) => (
                  <tr key={subgroup.id}>
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

