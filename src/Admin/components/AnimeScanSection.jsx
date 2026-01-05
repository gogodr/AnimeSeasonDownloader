import React, { useState, useEffect } from 'react';
import './AnimeScanSection.css';

function AnimeScanSection({ animeLocation }) {
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (animeLocation) {
      fetchDownloads();
    }
  }, [animeLocation, page]);

  const fetchDownloads = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/admin/file-downloads?page=${page}&pageSize=${pageSize}`);
      if (!response.ok) {
        throw new Error('Failed to fetch file downloads');
      }
      const data = await response.json();
      setDownloads(data.records || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching file downloads:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScanFolder = async () => {
    if (!animeLocation) {
      setError('Anime location is not configured');
      return;
    }

    try {
      setScanning(true);
      setError(null);
      const response = await fetch('/api/admin/scan-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folderPath: animeLocation }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to scan folder');
      }

      // Refresh the downloads list after a short delay
      setTimeout(() => {
        fetchDownloads();
      }, 2000);
    } catch (err) {
      setError(err.message);
      console.error('Error scanning folder:', err);
    } finally {
      setScanning(false);
    }
  };

  if (!animeLocation) {
    return null;
  }

  return (
    <div className="anime-scan-section">
      <h2 className="section-title">Anime Scan</h2>
      
      <div className="scan-controls">
        <div className="folder-info">
          <strong>Folder Location:</strong> <span className="folder-path">{animeLocation}</span>
        </div>
        <button
          className="scan-folder-button"
          onClick={handleScanFolder}
          disabled={scanning}
        >
          {scanning ? 'Scanning...' : 'Scan Folder'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && downloads.length === 0 ? (
        <div className="loading-message">Loading...</div>
      ) : (
        <>
          {total > 0 && (
            <div className="downloads-summary">
              Found {total} downloaded episode{total !== 1 ? 's' : ''}
            </div>
          )}

          {downloads.length > 0 ? (
            <>
              <div className="downloads-table-container">
                <table className="downloads-table">
                  <thead>
                    <tr>
                      <th>Anime Title</th>
                      <th>Episode</th>
                      <th>Subgroup</th>
                      <th>Filename</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downloads.map((download) => (
                      <tr key={download.id}>
                        <td>{download.animeTitle}</td>
                        <td>{download.episodeNumber || 'N/A'}</td>
                        <td>{download.subGroupName || 'N/A'}</td>
                        <td className="filename-cell" title={download.filePath}>
                          {download.fileName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="pagination-button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                  >
                    Previous
                  </button>
                  <span className="pagination-info">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    className="pagination-button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loading}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="no-downloads">
              {loading ? 'Loading...' : 'No downloaded episodes found. Click "Scan Folder" to search for files.'}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AnimeScanSection;
