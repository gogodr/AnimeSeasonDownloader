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
    console.log('[downloadTorrent] Starting downloadTorrent function');
    console.log('[downloadTorrent] Parameters:', { torrentUrl, options });
    
    const { animeTitle, animeId, torrentId } = options;
    console.log('[downloadTorrent] Extracted options:', { animeTitle, animeId, torrentId });
    
    // Get configuration
    console.log('[downloadTorrent] Getting configuration...');
    const config = getConfiguration();
    console.log('[downloadTorrent] Configuration retrieved:', {
        enableAutomaticAnimeFolderClassification: config.enableAutomaticAnimeFolderClassification,
        maxDownloadSpeed: config.maxDownloadSpeed,
        maxUploadSpeed: config.maxUploadSpeed
    });
    
    // Get the actual location path to use for operations (uses /app/anime if from env)
    console.log('[downloadTorrent] Getting anime location for operations...');
    const animeLocationForOps = getAnimeLocationForOperations();
    console.log('[downloadTorrent] Anime location:', animeLocationForOps);
    
    if (!animeLocationForOps) {
        console.error('[downloadTorrent] ERROR: Anime location is not configured');
        throw new Error('Anime location is not configured');
    }
    
    // Determine download path
    let downloadPath = animeLocationForOps;
    console.log('[downloadTorrent] Initial download path:', downloadPath);
    
    // If automatic folder classification is enabled, create/find folder for anime
    if (config.enableAutomaticAnimeFolderClassification && animeTitle) {
        console.log('[downloadTorrent] Automatic folder classification enabled, processing anime title...');
        const sanitizedTitle = sanitizeFolderName(animeTitle);
        downloadPath = join(animeLocationForOps, sanitizedTitle);
        console.log('[downloadTorrent] Sanitized title:', sanitizedTitle);
        console.log('[downloadTorrent] Updated download path:', downloadPath);
    }
    
    // Ensure download directory exists
    console.log('[downloadTorrent] Checking if download directory exists:', downloadPath);
    const downloadPathExists = existsSync(downloadPath);
    console.log('[downloadTorrent] Download path exists:', downloadPathExists);
    
    if (!downloadPathExists) {
        console.log('[downloadTorrent] Creating download directory:', downloadPath);
        try {
            mkdirSync(downloadPath, { recursive: true });
            console.log('[downloadTorrent] Successfully created download directory');
        } catch (error) {
            console.error('[downloadTorrent] ERROR creating download directory:', error);
            throw error;
        }
    }
    
    console.log('[downloadTorrent] Getting torrent client...');
    const torrentClient = getTorrentClient();
    console.log('[downloadTorrent] Torrent client obtained');
    console.log('[downloadTorrent] Current active torrents in client:', torrentClient.torrents ? torrentClient.torrents.length : 0);
    
    console.log('[downloadTorrent] Creating and returning Promise...');
    return new Promise((resolve, reject) => {
        console.log('[downloadTorrent] ===== Promise executor started =====');
        console.log('[downloadTorrent] Inside Promise, checking for existing torrents...');
        // Check if torrent is already downloading by URL
        const existingTorrents = torrentClient.torrents || [];
        console.log('[downloadTorrent] Existing torrents count:', existingTorrents.length);
        
        const existingTorrent = existingTorrents.find(t => 
            (t.torrentFile === torrentUrl || t.magnetURI === torrentUrl)
        );
        
        if (existingTorrent) {
            console.log('[downloadTorrent] Found existing torrent with infoHash:', existingTorrent.infoHash);
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
            
            console.log('[downloadTorrent] Returning existing torrent with status:', status);
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
        
        console.log('[downloadTorrent] No existing torrent found, proceeding with new download');
        
        // Check if we should pause this torrent (if there are already 3 active torrents)
        const activeCount = countActiveTorrents();
        const shouldPause = activeCount >= MAX_ACTIVE_TORRENTS;
        console.log('[downloadTorrent] Active torrents count:', activeCount, 'MAX_ACTIVE_TORRENTS:', MAX_ACTIVE_TORRENTS, 'shouldPause:', shouldPause);
        
        // Create chunks directory in the same anime directory
        const chunksDir = join(downloadPath, '.torrent-chunks');
        console.log('[downloadTorrent] Chunks directory path:', chunksDir);
        
        const chunksDirExists = existsSync(chunksDir);
        console.log('[downloadTorrent] Chunks directory exists:', chunksDirExists);
        
        if (!chunksDirExists) {
            console.log('[downloadTorrent] Creating chunks directory...');
            try {
                mkdirSync(chunksDir, { recursive: true });
                console.log('[downloadTorrent] Successfully created chunks directory');
            } catch (error) {
                console.error('[downloadTorrent] ERROR creating chunks directory:', error);
                reject(error);
                return;
            }
        }
        
        // Create a custom store class that uses the chunks directory
        // WebTorrent expects a constructor class, not a function
        class CustomChunkStore extends ChunkStore {
            constructor(chunkLength, opts) {
                console.log('[downloadTorrent] CustomChunkStore constructor called with chunkLength:', chunkLength, 'opts:', opts);
                // Override the path option to use our chunks directory
                super(chunkLength, {
                    ...opts,
                    path: chunksDir
                });
                console.log('[downloadTorrent] CustomChunkStore initialized');
            }
        }
        
        console.log('[downloadTorrent] Adding torrent to client with URL:', torrentUrl);
        console.log('[downloadTorrent] Torrent options:', { path: downloadPath, store: 'CustomChunkStore' });
        
        // Add torrent using the URL directly with custom store
        let torrent;
        try {
            torrent = torrentClient.add(torrentUrl, { 
                path: downloadPath,
                store: CustomChunkStore
            }, (torrent) => {
                console.log('[downloadTorrent] Torrent callback triggered - torrent is ready');
                console.log('[downloadTorrent] Torrent infoHash:', torrent.infoHash);
                console.log('[downloadTorrent] Torrent name:', torrent.name);
                console.log('[downloadTorrent] Torrent ready status:', torrent.ready);
                
                // Torrent is ready
                const infoHash = torrent.infoHash;
                
                // Track this torrent
                if (torrentId) {
                    torrentTrackingMap.set(torrentId, infoHash);
                    console.log('[downloadTorrent] Tracked torrent by ID:', torrentId);
                }
                torrentTrackingMap.set(torrentUrl, infoHash);
                console.log('[downloadTorrent] Tracked torrent by URL:', torrentUrl);
                
                const result = {
                    infoHash: infoHash,
                    torrentUrl: torrentUrl,
                    downloadPath: downloadPath,
                    status: shouldPause ? 'queued' : (torrent.ready ? 'ready' : 'downloading'),
                    animeId: animeId,
                    torrentId: torrentId
                };
                
                console.log('[downloadTorrent] Resolving promise with result:', result);
                resolve(result);
            });
            console.log('[downloadTorrent] Torrent added successfully, torrent object:', torrent ? 'created' : 'null');
        } catch (error) {
            console.error('[downloadTorrent] ERROR adding torrent:', error);
            reject(error);
            return;
        }
        
        // Pause immediately if needed (before ready event)
        if (shouldPause) {
            console.log('[downloadTorrent] Pausing torrent immediately (queue full)');
            try {
                torrent.pause();
                console.log('[downloadTorrent] Torrent paused successfully');
            } catch (error) {
                console.error('[downloadTorrent] ERROR pausing torrent:', error);
            }
        }
        
        // Set up additional event listeners for debugging
        torrent.on('warning', (warning) => {
            console.warn('[downloadTorrent] Torrent "warning" event:', warning);
        });
        
        torrent.on('noPeers', () => {
            console.log('[downloadTorrent] Torrent "noPeers" event triggered');
        });
        
        torrent.on('download', (bytes) => {
            console.log('[downloadTorrent] Torrent "download" event - downloaded bytes:', bytes);
        });
        
        // Rescan files to resume from existing chunks if they exist
        torrent.on('ready', () => {
            console.log('[downloadTorrent] Torrent "ready" event triggered');
            console.log('[downloadTorrent] Torrent infoHash on ready:', torrent.infoHash);
            console.log('[downloadTorrent] Torrent name on ready:', torrent.name);
            console.log('[downloadTorrent] Torrent files count on ready:', torrent.files ? torrent.files.length : 0);
            try {
                console.log('[downloadTorrent] Calling rescanFiles...');
                torrent.rescanFiles();
                console.log('[downloadTorrent] Rescanned files successfully');
            } catch (error) {
                console.error('[downloadTorrent] ERROR rescaning files:', error);
                console.error('[downloadTorrent] Error stack:', error.stack);
            }
        });
        
        // Set up completion listener to unpause queued torrents and store files
        torrent.on('done', () => {
            console.log('[downloadTorrent] Torrent "done" event triggered');
            console.log('[downloadTorrent] Torrent files count:', torrent.files ? torrent.files.length : 0);
            console.log('[downloadTorrent] Torrent path:', torrent.path);
            
            // Unpause the next queued torrent
            console.log('[downloadTorrent] Attempting to unpause next queued torrent...');
            unpauseNextQueuedTorrent();
            
            // Store files in database
            if (torrentId) {
                console.log('[downloadTorrent] Storing files in database for torrentId:', torrentId);
                try {
                    // Store all files from the torrent
                    torrent.files.forEach((file, index) => {
                        console.log(`[downloadTorrent] Processing file ${index + 1}/${torrent.files.length}:`, file.name);
                        const filePath = join(torrent.path, file.path);
                        const fileName = file.name;
                        console.log(`[downloadTorrent] File path:`, filePath, 'File name:', fileName);
                        upsertFileTorrentDownload(torrentId, filePath, fileName);
                    });
                    console.log(`[downloadTorrent] Stored ${torrent.files.length} file(s) for torrent ID ${torrentId}`);
                } catch (error) {
                    console.error(`[downloadTorrent] ERROR storing files for torrent ID ${torrentId}:`, error);
                }
            } else {
                console.log('[downloadTorrent] No torrentId provided, skipping database storage');
            }
            
            // Move final consolidated file from .torrent-chunks to torrent's download path
            // The filename in .torrent-chunks matches the filename from the torrent's file path
            console.log('[downloadTorrent] Starting file cleanup and move process...');
            try {
                const chunksDir = join(downloadPath, '.torrent-chunks');
                console.log('[downloadTorrent] Checking chunks directory:', chunksDir);
                
                if (existsSync(chunksDir)) {
                    console.log('[downloadTorrent] Chunks directory exists, proceeding with cleanup');
                    // Move the file from chunk directory to its final location
                    if (existsSync(chunksDir) && torrent.files.length > 0) {
                        console.log('[downloadTorrent] Processing single file torrent');
                        const file = torrent.files[0]; // Single file torrent
                        const fileName = file.name;
                        const srcFilePath = join(chunksDir, fileName);
                        const destFilePath = join(torrent.path, file.path);
                        
                        console.log('[downloadTorrent] Source file path:', srcFilePath);
                        console.log('[downloadTorrent] Destination file path:', destFilePath);
                        console.log('[downloadTorrent] Source file exists:', existsSync(srcFilePath));
                        console.log('[downloadTorrent] Destination file exists:', existsSync(destFilePath));
                        
                        if (existsSync(srcFilePath)) {
                            console.log('[downloadTorrent] Source file found, preparing to move...');
                            // Ensure destination directory exists
                            const destDir = dirname(destFilePath);
                            console.log('[downloadTorrent] Destination directory:', destDir);
                            console.log('[downloadTorrent] Destination directory exists:', existsSync(destDir));
                            
                            if (!existsSync(destDir)) {
                                console.log('[downloadTorrent] Creating destination directory...');
                                mkdirSync(destDir, { recursive: true });
                                console.log('[downloadTorrent] Destination directory created');
                            }
                            
                            // Move the file
                            console.log('[downloadTorrent] Moving file from source to destination...');
                            renameSync(srcFilePath, destFilePath);
                            console.log(`[downloadTorrent] Moved ${fileName} from .torrent-chunks to ${file.path}`);
                            
                            // Remove the torrent's chunk directory if empty
                            try {
                                console.log('[downloadTorrent] Checking if chunks directory is empty...');
                                const remainingInTorrentDir = readdirSync(chunksDir);
                                console.log('[downloadTorrent] Remaining entries in chunks directory:', remainingInTorrentDir.length);
                                if (remainingInTorrentDir.length === 0) {
                                    console.log('[downloadTorrent] Chunks directory is empty, removing...');
                                    rmdirSync(chunksDir);
                                    console.log(`[downloadTorrent] Removed empty torrent chunk directory`);
                                }
                            } catch (err) {
                                console.log('[downloadTorrent] Could not remove chunks directory (may already be deleted):', err.message);
                                // Directory might already be deleted or have permission issues
                            }
                        } else {
                            console.log('[downloadTorrent] Source file does not exist, skipping move');
                        }
                    } else {
                        console.log('[downloadTorrent] No files in torrent or chunks directory does not exist');
                    }
                    
                    // Check if chunks directory is empty and delete it
                    try {
                        console.log('[downloadTorrent] Final check if chunks directory is empty...');
                        const remainingEntries = readdirSync(chunksDir);
                        console.log('[downloadTorrent] Remaining entries:', remainingEntries.length);
                        if (remainingEntries.length === 0) {
                            console.log('[downloadTorrent] Deleting empty chunks directory...');
                            rmdirSync(chunksDir);
                            console.log(`[downloadTorrent] Deleted empty .torrent-chunks folder`);
                        }
                    } catch (err) {
                        console.log('[downloadTorrent] Could not delete chunks directory:', err.message);
                        // Directory might already be deleted or have permission issues
                    }
                } else {
                    console.log('[downloadTorrent] Chunks directory does not exist, skipping cleanup');
                }
            } catch (error) {
                console.error(`[downloadTorrent] ERROR cleaning up .torrent-chunks folder:`, error);
                console.error(`[downloadTorrent] Error stack:`, error.stack);
            }
            
            // Remove torrent from client
            console.log('[downloadTorrent] Destroying torrent...');
            try {
                torrent.destroy();
                console.log(`[downloadTorrent] Destroyed torrent ${torrent.infoHash}`);
            } catch (error) {
                console.error(`[downloadTorrent] ERROR destroying torrent:`, error);
                console.error(`[downloadTorrent] Error stack:`, error.stack);
            }
        });
        
        // Handle errors
        torrent.on('error', (err) => {
            console.error('[downloadTorrent] Torrent "error" event triggered');
            console.error('[downloadTorrent] Error details:', err);
            console.error('[downloadTorrent] Error message:', err.message);
            console.error('[downloadTorrent] Error stack:', err.stack);
            console.error('[downloadTorrent] Torrent infoHash:', torrent.infoHash);
            console.error('[downloadTorrent] Torrent paused:', torrent.paused);
            
            // Remove from tracking on error
            console.log('[downloadTorrent] Removing torrent from tracking maps...');
            if (torrentId) {
                torrentTrackingMap.delete(torrentId);
                console.log('[downloadTorrent] Removed from tracking by torrentId:', torrentId);
            }
            torrentTrackingMap.delete(torrentUrl);
            console.log('[downloadTorrent] Removed from tracking by URL:', torrentUrl);
            
            // Unpause the next queued torrent if this one was active
            if (!torrent.paused) {
                console.log('[downloadTorrent] Torrent was active, unpausing next queued torrent...');
                unpauseNextQueuedTorrent();
            } else {
                console.log('[downloadTorrent] Torrent was paused, skipping unpause');
            }
            
            console.log('[downloadTorrent] Rejecting promise with error');
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

