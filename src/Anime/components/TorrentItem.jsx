import React from 'react';
import './TorrentItem.css';

function TorrentItem({ torrent }) {
  const formatTorrentDate = (date) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="torrent-item">
      <a 
        href={torrent.link} 
        target="_blank" 
        rel="noopener noreferrer"
        className="torrent-link"
      >
        {torrent.title || 'Torrent Link'}
      </a>
      <div className="torrent-meta">
        {torrent.subGroup && (
          <span className="torrent-subgroup">{torrent.subGroup}</span>
        )}
        <span className="torrent-date">{formatTorrentDate(torrent.date)}</span>
      </div>
    </div>
  );
}

export default TorrentItem;

