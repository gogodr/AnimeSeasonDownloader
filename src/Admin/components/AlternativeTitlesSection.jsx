import React, { useState, useEffect } from 'react';
import SearchInput from './SearchInput';
import './AlternativeTitlesSection.css';

function AlternativeTitlesSection() {
  const [animeWithAltTitles, setAnimeWithAltTitles] = useState([]);
  const [loading, setLoading] = useState(true);
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
    fetchAllAlternativeTitles();
  }, []);

  const fetchAllAlternativeTitles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/alternative-titles/all');
      if (!response.ok) {
        throw new Error('Failed to fetch alternative titles');
      }
      const data = await response.json();
      setAnimeWithAltTitles(data);
      setExpandedAnime(new Set(data.map(a => a.id)));
    } catch (err) {
      console.error('Error fetching alternative titles:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
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

      await fetchAllAlternativeTitles();
      setEditingTitle(null);
      setEditingAnimeId(null);
      setAddingToAnimeId(null);
      setNewTitleText('');
      
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

  const handleAnimeSearchChange = (value) => {
    setAnimeSearchQuery(value);
    searchAnimeForAdd(value);
  };

  const handleAnimeSelect = (anime) => {
    const existingIndex = animeWithAltTitles.findIndex(a => a.id === anime.id);
    
    if (existingIndex === -1) {
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
      
      const newExpanded = new Set(expandedAnime);
      newExpanded.add(anime.id);
      setExpandedAnime(newExpanded);
      setAddingToAnimeId(anime.id);
    } else {
      const newExpanded = new Set(expandedAnime);
      newExpanded.add(anime.id);
      setExpandedAnime(newExpanded);
      setAddingToAnimeId(anime.id);
    }
    
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

  const renderAnimeSuggestion = (anime) => (
    <div className="anime-suggestion">
      <span className="anime-title">{anime.title}</span>
      {anime.titleRomaji && anime.titleRomaji !== anime.title && (
        <span className="anime-subtitle">{anime.titleRomaji}</span>
      )}
    </div>
  );

  return (
    <div className="table-container">
      <div className="section-header">
        <h3 className="section-title">Alternative Titles</h3>
        {!loading && (
          <button
            onClick={handleShowAddAnime}
            className="add-anime-button"
            disabled={showAddAnime || editingTitle !== null}
          >
            + Add Anime
          </button>
        )}
      </div>
      
      {showAddAnime && (
        <div className="add-anime-container">
          <div className="search-container">
            <SearchInput
              value={animeSearchQuery}
              onChange={handleAnimeSearchChange}
              placeholder="Search anime to add..."
              suggestions={animeSuggestions}
              onSuggestionSelect={handleAnimeSelect}
              renderSuggestion={renderAnimeSuggestion}
            />
          </div>
          <button
            onClick={handleCancelAddAnime}
            className="cancel-button-small"
          >
            Cancel
          </button>
        </div>
      )}
      
      {loading ? (
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
  );
}

export default AlternativeTitlesSection;

