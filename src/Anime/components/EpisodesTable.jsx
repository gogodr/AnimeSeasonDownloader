import React from 'react';
import TorrentItem from './TorrentItem';
import './EpisodesTable.css';

function EpisodesTable({ episodes }) {
  const formatAiringDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (!episodes || episodes.length === 0) {
    return (
      <div className="episodes-section">
        <h2 className="episodes-section-title">Episodes</h2>
        <div className="no-episodes">No episodes tracked yet.</div>
      </div>
    );
  }

  return (
    <div className="episodes-section">
      <h2 className="episodes-section-title">Episodes</h2>
      <div className="episodes-table-container">
        <table className="episodes-table">
          <thead>
            <tr>
              <th>Episode</th>
              <th>Airing Date</th>
              <th>Torrents</th>
            </tr>
          </thead>
          <tbody>
            {episodes.map((episode) => (
              <tr key={episode.episode}>
                <td className="episode-number">
                  <strong>Episode {episode.episode}</strong>
                </td>
                <td className="episode-airing">
                  {formatAiringDate(episode.airingAt)}
                </td>
                <td className="episode-torrents">
                  {episode.torrents && episode.torrents.length > 0 ? (
                    <div className="torrents-list">
                      {episode.torrents.map((torrent, index) => (
                        <TorrentItem key={index} torrent={torrent} />
                      ))}
                    </div>
                  ) : (
                    <span className="no-torrents">No torrents available</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EpisodesTable;

