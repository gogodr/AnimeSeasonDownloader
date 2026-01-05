import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { getDB } from '../database/animeDB.js';
import { upsertFileTorrentDownload } from '../database/animeDB.js';


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
    
    // Get all torrents from database
    const database = getDB();
    const torrentsQuery = database.prepare(`
        SELECT 
            t.id,
            t.title,
            e.anime_id
        FROM torrents t
        INNER JOIN episodes e ON t.episode_id = e.id
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
    
    // Match files with torrents (only for files that don't already have records)
    for (const filePath of files) {
        // Skip if record already exists
        if (existingFilePaths.has(filePath)) {
            continue;
        }
        
        const fileName = basename(filePath);
        const fileNameLower = fileName.toLowerCase();
        
        // Try to find matching torrent
        for (const torrent of torrents) {
            // Direct matching: check if torrent title appears in filename (case-insensitive)
            const torrentTitleLower = torrent.title.toLowerCase();
            const titleMatches = fileNameLower.includes(torrentTitleLower);
            
            // Match if title is found in filename
            if (titleMatches) {
                upsertFileTorrentDownload(torrent.id, filePath, fileName);
                matchedCount++;
                break; // Only match one torrent per file
            }
        }
    }
    
    console.log(`Matched ${matchedCount} new files`);
    
    return {
        message: `Scanned folder and matched ${matchedCount} new files`,
        filesScanned: files.length,
        torrentsChecked: torrents.length,
        matchedCount,
        deletedCount
    };
}
