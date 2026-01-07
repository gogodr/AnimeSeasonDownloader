import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { getDB } from '../database/animeDB.js';
import { upsertFileTorrentDownload } from '../database/animeDB.js';
import { downloadTorrent } from './torrentService.js';


/**
 * Recursively scans a directory for files
 * @param {string} dirPath - Directory path to scan
 * @param {Array} fileList - Array to accumulate file paths
 * @returns {Promise<Array>} Array of file paths
 */
async function scanDirectory(dirPath, fileList = []) {
    try {
        const entries = await readdir(dirPath);
        
        for (const entry of entries) {
            const fullPath = join(dirPath, entry);
            try {
                const stats = await stat(fullPath);
                
                if (stats.isDirectory()) {
                    await scanDirectory(fullPath, fileList);
                } else if (stats.isFile()) {
                    fileList.push(fullPath);
                }
            } catch (err) {
                // Skip files/directories we can't access
                console.warn(`Cannot access ${fullPath}:`, err.message);
            }
        }
    } catch (err) {
        console.error(`Error scanning directory ${dirPath}:`, err.message);
    }
    
    return fileList;
}

/**
 * Matches files with torrents in the database
 * @param {string} folderPath - Path to the folder to scan
 * @returns {Promise<Object>} Result object with matched count
 */
export async function scanFolderForTorrents(folderPath) {
    if (!folderPath) {
        throw new Error('Folder path is required');
    }
    
    console.log(`Scanning folder: ${folderPath}`);
    
    // Scan directory for all files
    const files = await scanDirectory(folderPath);
    console.log(`Found ${files.length} files to process`);
    
    // Get all torrents from database with anime title
    const database = getDB();
    const torrentsQuery = database.prepare(`
        SELECT 
            t.id,
            t.title,
            t.link,
            e.anime_id,
            COALESCE(a.title_english, a.title_romaji, a.title_native) as anime_title
        FROM torrents t
        INNER JOIN episodes e ON t.episode_id = e.id
        INNER JOIN anime a ON e.anime_id = a.id
        WHERE t.link IS NOT NULL AND t.link != ''
    `);
    
    const torrents = torrentsQuery.all();
    console.log(`Found ${torrents.length} torrents in database`);
    
    // Get all existing records from database
    const existingRecordsQuery = database.prepare(`
        SELECT id, file_path, torrent_id
        FROM file_torrent_download
    `);
    const existingRecords = existingRecordsQuery.all();
    
    // Create a set of existing file paths for quick lookup
    const existingFilePaths = new Set(existingRecords.map(r => r.file_path));
    
    // Prepared statement to check if torrent exists in torrents table
    const checkTorrentExistsStmt = database.prepare(`SELECT id FROM torrents WHERE id = ?`);
    
    // Delete records for files that no longer exist or torrents that no longer exist
    const deleteStmt = database.prepare(`DELETE FROM file_torrent_download WHERE id = ?`);
    let deletedCount = 0;
    
    for (const record of existingRecords) {
        let shouldDelete = false;
        
        // Check if file still exists
        try {
            await stat(record.file_path);
        } catch (err) {
            // File doesn't exist, mark for deletion
            shouldDelete = true;
        }
        
        // Check if referenced torrent still exists in the torrents table
        if (!shouldDelete) {
            const torrentExists = checkTorrentExistsStmt.get(record.torrent_id);
            if (!torrentExists) {
                // Torrent doesn't exist in the torrents table, mark for deletion
                shouldDelete = true;
            }
        }
        
        if (shouldDelete) {
            // Delete the record
            deleteStmt.run(record.id);
            deletedCount++;
            // Also remove from the set since it's been deleted
            existingFilePaths.delete(record.file_path);
        }
    }
    
    if (deletedCount > 0) {
        console.log(`Deleted ${deletedCount} records for files that no longer exist`);
    }
    
    let matchedCount = 0;
    let resumedCount = 0;
    
    // Match files with torrents (only for files that don't already have records)
    for (const filePath of files) {
        // Skip if record already exists
        if (existingFilePaths.has(filePath)) {
            continue;
        }
        
        const fileName = basename(filePath);
        const fileNameLower = fileName.toLowerCase();
        
        // Check if file is in a .torrent-chunks folder
        const isInChunksFolder = filePath.includes('.torrent-chunks');
        
        // Try to find matching torrent
        for (const torrent of torrents) {
            // Direct matching: check if torrent title appears in filename (case-insensitive)
            const torrentTitleLower = torrent.title.toLowerCase();
            const titleMatches = fileNameLower.includes(torrentTitleLower);
            
            // Match if title is found in filename
            if (titleMatches) {
                if (isInChunksFolder) {
                    // File is in .torrent-chunks folder - treat as incomplete and resume download
                    try {
                        console.log(`Found incomplete file ${fileName} in .torrent-chunks, resuming download for torrent ${torrent.id}`);
                        await downloadTorrent(torrent.link, {
                            animeTitle: torrent.anime_title,
                            animeId: torrent.anime_id,
                            torrentId: torrent.id
                        });
                        resumedCount++;
                    } catch (error) {
                        console.error(`Error resuming torrent download for ${fileName}:`, error);
                    }
                } else {
                    // File is complete - create database record
                    upsertFileTorrentDownload(torrent.id, filePath, fileName);
                    matchedCount++;
                }
                break; // Only match one torrent per file
            }
        }
    }
    
    console.log(`Matched ${matchedCount} new files, resumed ${resumedCount} incomplete downloads`);
    
    return {
        message: `Scanned folder and matched ${matchedCount} new files, resumed ${resumedCount} incomplete downloads`,
        filesScanned: files.length,
        torrentsChecked: torrents.length,
        matchedCount,
        resumedCount,
        deletedCount
    };
}
