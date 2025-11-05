import React, { useState, useEffect } from 'react';
import './AlternativeTitlesManager.css';

function AlternativeTitlesManager({ animeId, onUpdate }) {
  const [alternativeTitles, setAlternativeTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(null);
  const [newTitleText, setNewTitleText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAlternativeTitles();
  }, [animeId]);

  const fetchAlternativeTitles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/alternative-titles/${animeId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch alternative titles');
      }
      const data = await response.json();
      setAlternativeTitles(data);
    } catch (err) {
      console.error('Error fetching alternative titles:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTitle = () => {
    setIsAdding(true);
    setEditingTitle(null);
    setNewTitleText('');
  };

  const handleEditTitle = (title) => {
    setEditingTitle(title);
    setIsAdding(false);
    setNewTitleText(title.title);
  };

  const handleSaveTitle = async () => {
    if (!newTitleText.trim()) {
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

      await fetchAlternativeTitles();
      if (onUpdate) {
        onUpdate();
      }
      setEditingTitle(null);
      setIsAdding(false);
      setNewTitleText('');
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTitle = async (id) => {
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

      await fetchAlternativeTitles();
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingTitle(null);
    setIsAdding(false);
    setNewTitleText('');
  };

  if (loading) {
    return (
      <div className="alternative-titles-manager">
        <div className="container">
          <div className="loading">Loading alternative titles...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="alternative-titles-section">
      <div className="alternative-titles-header">
        <h2 className="alternative-titles-title">Alternative Titles</h2>
        {!isAdding && !editingTitle && (
          <button
            onClick={handleAddTitle}
            className="add-title-button"
            disabled={saving}
          >
            + Add Title
          </button>
        )}
      </div>

      {(isAdding || editingTitle) && (
        <div className="alt-title-form">
          <input
            type="text"
            placeholder={editingTitle ? "Edit alternative title..." : "Enter alternative title..."}
            value={newTitleText}
            onChange={(e) => setNewTitleText(e.target.value)}
            className="alt-title-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveTitle();
              } else if (e.key === 'Escape') {
                handleCancelEdit();
              }
            }}
            autoFocus
          />
          <div className="alt-title-actions">
            <button
              onClick={handleSaveTitle}
              disabled={saving || !newTitleText.trim()}
              className="save-button"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={saving}
              className="cancel-button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {alternativeTitles.length === 0 && !isAdding && !editingTitle ? (
        <div className="no-alt-titles">
          No alternative titles. Click "Add Title" to add one.
        </div>
      ) : (
        <div className="alt-titles-list">
          {alternativeTitles.map((title) => {
            const isEditingThis = editingTitle && editingTitle.id === title.id;
            return (
              <div key={title.id} className="alt-title-item">
                {isEditingThis ? (
                  <div className="alt-title-form">
                    <input
                      type="text"
                      value={newTitleText}
                      onChange={(e) => setNewTitleText(e.target.value)}
                      className="alt-title-input"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveTitle();
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      autoFocus
                    />
                    <div className="alt-title-actions">
                      <button
                        onClick={handleSaveTitle}
                        disabled={saving || !newTitleText.trim()}
                        className="save-button"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={saving}
                        className="cancel-button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="alt-title-text">{title.title}</span>
                    <div className="alt-title-actions">
                      <button
                        onClick={() => handleEditTitle(title)}
                        className="edit-button"
                        disabled={editingTitle !== null || isAdding}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTitle(title.id)}
                        className="delete-button"
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
    </div>
  );
}

export default AlternativeTitlesManager;

