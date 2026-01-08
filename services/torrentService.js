import WebTorrent from 'webtorrent';
import ChunkStore from 'fs-chunk-store';
import { getConfiguration, getAnimeLocationForOperations, upsertFileTorrentDownload } from '../database/animeDB.js';
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

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
    
    // Apply speed limits from configuration
    applySpeedLimits();
    
    console.log('WebTorrent client initialized');
    return client;
}

/**
 * Applies speed limits from configuration to the WebTorrent client
 */
function applySpeedLimits() {
    if (!client) {
        return;
    }
    
    const config = getConfiguration();
    
    // Set download limit (in bytes per second)
    // null or undefined means unlimited
    if (config.maxDownloadSpeed !== null && config.maxDownloadSpeed !== undefined) {
        client.downloadLimit = config.maxDownloadSpeed;
        console.log(`WebTorrent download limit set to ${config.maxDownloadSpeed} bytes/sec`);
    } else {
        client.downloadLimit = 0; // 0 means unlimited in WebTorrent
        console.log('WebTorrent download limit set to unlimited');
    }
    
    // Set upload limit (in bytes per second)
    // null or undefined means unlimited
    if (config.maxUploadSpeed !== null && config.maxUploadSpeed !== undefined) {
        client.uploadLimit = config.maxUploadSpeed;
        console.log(`WebTorrent upload limit set to ${config.maxUploadSpeed} bytes/sec`);
    } else {
        client.uploadLimit = 0; // 0 means unlimited in WebTorrent
        console.log('WebTorrent upload limit set to unlimited');
    }
}

/**
 * Updates the speed limits on the WebTorrent client
 * Call this after configuration changes
 */
export function updateSpeedLimits() {
    applySpeedLimits();
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
    
    // Get the actual location path to use for operations (uses /app/anime if from env)
    const animeLocationForOps = getAnimeLocationForOperations();
    
    if (!animeLocationForOps) {
        throw new Error('Anime location is not configured');
    }
    
    // Determine download path
    let downloadPath = animeLocationForOps;
    
    // If automatic folder classification is enabled, create/find folder for anime
    if (config.enableAutomaticAnimeFolderClassification && animeTitle) {
        const sanitizedTitle = sanitizeFolderName(animeTitle);
        downloadPath = join(animeLocationForOps, sanitizedTitle);
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
        
        // Create chunks directory in the same anime directory
        const chunksDir = join(downloadPath, '.torrent-chunks');
        if (!existsSync(chunksDir)) {
            mkdirSync(chunksDir, { recursive: true });
        }
        
        // Create a custom store class that uses the chunks directory
        // WebTorrent expects a constructor class, not a function
        class CustomChunkStore extends ChunkStore {
            constructor(chunkLength, opts) {
                // Override the path option to use our chunks directory
                super(chunkLength, {
                    ...opts,
                    path: chunksDir
                });
            }
        }        
        // Add torrent using the URL directly with custom store
        const torrent = torrentClient.add(torrentUrl, { 
            path: downloadPath,
            store: CustomChunkStore
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
        
        // Rescan files to resume from existing chunks if they exist
        torrent.on('ready', () => {
            torrent.rescanFiles();
        });
        
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
            
            // Move final consolidated file from .torrent-chunks to torrent's download path
            // The filename in .torrent-chunks matches the filename from the torrent's file path
            try {
                const chunksDir = join(downloadPath, '.torrent-chunks');
                if (existsSync(chunksDir)) {                    
                    // Move the file from chunk directory to its final location
                    if (existsSync(chunksDir) && torrent.files.length > 0) {
                        const file = torrent.files[0]; // Single file torrent
                        const fileName = file.name;
                        const srcFilePath = join(chunksDir, fileName);
                        const destFilePath = join(torrent.path, file.path);
                        
                        if (existsSync(srcFilePath)) {
                            // Ensure destination directory exists
                            const destDir = dirname(destFilePath);
                            if (!existsSync(destDir)) {
                                mkdirSync(destDir, { recursive: true });
                            }
                            
                            // Move the file
                            renameSync(srcFilePath, destFilePath);
                            console.log(`Moved ${fileName} from .torrent-chunks to ${file.path}`);
                            
                            // Remove the torrent's chunk directory if empty
                            try {
                                const remainingInTorrentDir = readdirSync(chunksDir);
                                if (remainingInTorrentDir.length === 0) {
                                    rmdirSync(chunksDir);
                                    console.log(`Removed empty torrent chunk directory`);
                                }
                            } catch (err) {
                                // Directory might already be deleted or have permission issues
                            }
                        }
                    }
                    
                    // Check if chunks directory is empty and delete it
                    try {
                        const remainingEntries = readdirSync(chunksDir);
                        if (remainingEntries.length === 0) {
                            rmdirSync(chunksDir);
                            console.log(`Deleted empty .torrent-chunks folder`);
                        }
                    } catch (err) {
                        // Directory might already be deleted or have permission issues
                    }
                }
            } catch (error) {
                console.error(`Error cleaning up .torrent-chunks folder:`, error);
            }
            
            // Remove torrent from client
            try {
                torrent.destroy();
                console.log(`Destroyed torrent ${torrent.infoHash}`);
            } catch (error) {
                console.error(`Error destroying torrent:`, error);
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

