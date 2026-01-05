import WebTorrent from 'webtorrent';
import { getConfiguration, upsertFileTorrentDownload } from '../database/animeDB.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

let client = null;
// Map to track torrents: key = torrentId or URL, value = infoHash
const torrentTrackingMap = new Map();
const MAX_ACTIVE_TORRENTS = 3;

/**
 * Initializes the WebTorrent client
 */
export function initializeTorrentClient() {
    if (client) {
        return client;
    }
    
    client = new WebTorrent();
    console.log('WebTorrent client initialized');
    return client;
}

/**
 * Gets the WebTorrent client instance
 */
export function getTorrentClient() {
    if (!client) {
        return initializeTorrentClient();
    }
    return client;
}

/**
 * Sanitizes folder name by removing invalid characters
 */
function sanitizeFolderName(name) {
    return name
        .replace(/[<>:"/\\|?*]/g, ' ') // Replace invalid characters with space
        .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
        .trim();
}

/**
 * Counts the number of active torrents (not paused, not done)
 * @returns {number} Number of active torrents
 */
function countActiveTorrents() {
    const torrentClient = getTorrentClient();
    const torrents = torrentClient.torrents || [];
    return torrents.filter(t => !t.paused && !t.done).length;
}

/**
 * Unpauses the next queued torrent if there's space for it
 */
function unpauseNextQueuedTorrent() {
    const torrentClient = getTorrentClient();
    const torrents = torrentClient.torrents || [];
    
    const activeCount = countActiveTorrents();
    if (activeCount >= MAX_ACTIVE_TORRENTS) {
        return; // Already at max capacity
    }
    
    // Find the first paused torrent that's not done
    const pausedTorrent = torrents.find(t => t.paused && !t.done);
    if (pausedTorrent) {
        pausedTorrent.resume();
        console.log(`Resumed queued torrent: ${pausedTorrent.name || pausedTorrent.infoHash}`);
    }
}


/**
 * Downloads a torrent to the specified location
 * @param {string} torrentUrl - Torrent file URL
 * @param {Object} options - Options including animeTitle, animeId, torrentId
 * @returns {Promise<Object>} Promise that resolves with torrent info
 */
export async function downloadTorrent(torrentUrl, options = {}) {
    const { animeTitle, animeId, torrentId } = options;
    
    // Get configuration
    const config = getConfiguration();
    
    if (!config.animeLocation) {
        throw new Error('Anime location is not configured');
    }
    
    // Determine download path
    let downloadPath = config.animeLocation;
    
    // If automatic folder classification is enabled, create/find folder for anime
    if (config.enableAutomaticAnimeFolderClassification && animeTitle) {
        const sanitizedTitle = sanitizeFolderName(animeTitle);
        downloadPath = join(config.animeLocation, sanitizedTitle);
    }
    
    // Ensure download directory exists
    if (!existsSync(downloadPath)) {
        mkdirSync(downloadPath, { recursive: true });
    }
    
    const torrentClient = getTorrentClient();
    
    return new Promise((resolve, reject) => {
        // Check if torrent is already downloading by URL
        const existingTorrents = torrentClient.torrents || [];
        const existingTorrent = existingTorrents.find(t => 
            (t.torrentFile === torrentUrl || t.magnetURI === torrentUrl)
        );
        
        if (existingTorrent) {
            // Already downloading
            const infoHash = existingTorrent.infoHash;
            if (torrentId) {
                torrentTrackingMap.set(torrentId, infoHash);
            }
            torrentTrackingMap.set(torrentUrl, infoHash);
            
            // Determine status
            let status = 'downloading';
            if (existingTorrent.done) {
                status = 'completed';
            } else if (existingTorrent.paused) {
                status = 'queued';
            } else if (!existingTorrent.ready) {
                status = 'initializing';
            }
            
            resolve({
                infoHash: infoHash,
                torrentUrl: torrentUrl,
                downloadPath: existingTorrent.path || downloadPath,
                status: status,
                animeId: animeId,
                torrentId: torrentId
            });
            return;
        }
        
        // Check if we should pause this torrent (if there are already 3 active torrents)
        const activeCount = countActiveTorrents();
        const shouldPause = activeCount >= MAX_ACTIVE_TORRENTS;
        
        // Add torrent using the URL directly
        const torrent = torrentClient.add(torrentUrl, { 
            path: downloadPath
        }, (torrent) => {
            // Torrent is ready
            const infoHash = torrent.infoHash;
            
            // Track this torrent
            if (torrentId) {
                torrentTrackingMap.set(torrentId, infoHash);
            }
            torrentTrackingMap.set(torrentUrl, infoHash);
            
            const result = {
                infoHash: infoHash,
                torrentUrl: torrentUrl,
                downloadPath: downloadPath,
                status: shouldPause ? 'queued' : (torrent.ready ? 'ready' : 'downloading'),
                animeId: animeId,
                torrentId: torrentId
            };
            
            resolve(result);
        });
        
        // Pause immediately if needed (before ready event)
        if (shouldPause) {
            torrent.pause();
        }
        
        // Set up completion listener to unpause queued torrents and store files
        torrent.on('done', () => {
            // Unpause the next queued torrent
            unpauseNextQueuedTorrent();
            
            // Store files in database
            if (torrentId) {
                try {
                    // Store all files from the torrent
                    torrent.files.forEach(file => {
                        const filePath = join(torrent.path, file.path);
                        const fileName = file.name;
                        upsertFileTorrentDownload(torrentId, filePath, fileName);
                    });
                    console.log(`Stored ${torrent.files.length} file(s) for torrent ID ${torrentId}`);
                } catch (error) {
                    console.error(`Error storing files for torrent ID ${torrentId}:`, error);
                }
            }
        });
        
        // Handle errors
        torrent.on('error', (err) => {
            // Remove from tracking on error
            if (torrentId) {
                torrentTrackingMap.delete(torrentId);
            }
            torrentTrackingMap.delete(torrentUrl);
            // Unpause the next queued torrent if this one was active
            if (!torrent.paused) {
                unpauseNextQueuedTorrent();
            }
            reject(new Error(`Torrent download error: ${err.message}`));
        });
    });
}

/**
 * Gets torrent status by torrent ID or URL
 * @param {number|string} torrentIdOrUrl - Torrent ID (number) or URL (string)
 * @returns {Object|null} Torrent status object or null if not found
 */
export function getTorrentStatusByTorrentIdOrUrl(torrentIdOrUrl) {
    const torrentClient = getTorrentClient();
    
    // First try to get infoHash from tracking map
    let infoHash = torrentTrackingMap.get(torrentIdOrUrl);
    let torrent = null;
    
    if (infoHash) {
        torrent = torrentClient.get(infoHash);
    }
    
    // If not found, try to find by URL in active torrents
    if (!torrent && typeof torrentIdOrUrl === 'string') {
        const existingTorrents = torrentClient.torrents || [];
        torrent = existingTorrents.find(t => 
            (t.torrentFile === torrentIdOrUrl || t.magnetURI === torrentIdOrUrl)
        );
        if (torrent) {
            infoHash = torrent.infoHash;
            torrentTrackingMap.set(torrentIdOrUrl, infoHash);
        }
    }
    
    if (!torrent) {
        return null;
    }
    
    const progress = torrent.progress || 0;
    const downloadSpeed = torrent.downloadSpeed || 0;
    
    let status = 'downloading';
    if (torrent.done) {
        status = 'completed';
    } else if (torrent.paused) {
        status = 'queued'; // Show paused torrents as queued
    } else if (!torrent.ready) {
        status = 'initializing';
    }
    
    return {
        infoHash: torrent.infoHash,
        status: status,
        progress: Math.round(progress * 100) / 100,
        downloadSpeed: downloadSpeed,
        ready: torrent.ready || false,
        done: torrent.done || false,
        paused: torrent.paused || false
    };
}

/**
 * Gets all active torrents with their status
 * @returns {Array} Array of torrent objects with status information
 */
export function getAllTorrents() {
    const torrentClient = getTorrentClient();
    const torrents = torrentClient.torrents || [];
    
    return torrents.map(torrent => {
        const progress = torrent.progress || 0;
        const downloadSpeed = torrent.downloadSpeed || 0;
        const uploadSpeed = torrent.uploadSpeed || 0;
        const numPeers = torrent.numPeers || 0;
        const downloaded = torrent.downloaded || 0;
        const length = torrent.length || 0;
        
        let status = 'downloading';
        if (torrent.done) {
            status = 'completed';
        } else if (torrent.paused) {
            status = 'queued'; // Show paused torrents as queued
        } else if (!torrent.ready) {
            status = 'initializing';
        }
        
        return {
            infoHash: torrent.infoHash,
            magnetURI: torrent.magnetURI || torrent.torrentFile || '',
            name: torrent.name || 'Unknown',
            path: torrent.path || '',
            progress: Math.round(progress * 100) / 100,
            downloadSpeed: downloadSpeed,
            uploadSpeed: uploadSpeed,
            numPeers: numPeers,
            downloaded: downloaded,
            length: length,
            timeRemaining: torrent.timeRemaining || Infinity,
            status: status,
            ready: torrent.ready || false,
            done: torrent.done || false,
            paused: torrent.paused || false
        };
    });
}

/**
 * Removes a torrent from the client
 * @param {string} infoHash - Info hash of the torrent to remove
 */
export function removeTorrent(infoHash) {
    const torrentClient = getTorrentClient();
    const torrent = torrentClient.get(infoHash);
    
    if (torrent) {
        torrentClient.remove(torrent, { destroyStore: false }, (err) => {
            if (err) {
                console.error(`Error removing torrent ${infoHash}:`, err);
            } else {
                console.log(`Removed torrent ${infoHash}`);
                // Unpause the next queued torrent if there's space
                unpauseNextQueuedTorrent();
            }
        });
    }
}

