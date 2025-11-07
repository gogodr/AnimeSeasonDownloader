import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import PQueue from 'p-queue';
import { getCachedAnidbResult, storeAnidbCache, getCachedAnidbHtml, getAnimeSeasonByAnidbId } from '../database/animeDB.js';

// Load environment variables
dotenv.config();

// Session cookie storage
let sessionCookie = null;
let authenticating = false; // Flag to prevent concurrent authentication attempts

// Rate limiting queue for AniDB requests
// Concurrency: 1 (only one request at a time)
// Interval: 2000ms (2 seconds between requests to avoid rate limiting)
const anidbQueue = new PQueue({ 
    concurrency: 1,
    interval: 1000,
    intervalCap: 1
});

/**
 * Authenticates with AniDB and retrieves session cookies
 * @returns {Promise<string|null>} Consolidated cookie string if successful, null otherwise
 */
async function authenticateAnidb() {
    const anidbUser = process.env.anidbUser;
    const anidbPassword = process.env.anidbPassword;

    if (!anidbUser || !anidbPassword) {
        console.error('AniDB credentials not found in environment variables. Please set anidbUser and anidbPassword in .env file');
        return null;
    }

    try {
        const formData = new URLSearchParams({
            show: 'main',
            xuser: anidbUser,
            xpass: anidbPassword,
            xdoautologin: 'on',
            'do.auth': 'login'
        });

        console.log('Authenticating with AniDB...');
        
        const response = await fetch('https://anidb.net/perl-bin/animedb.pl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            redirect: 'manual',
            body: formData.toString()
        });

        // Check if we got a redirect response
        if (response.status < 300 || response.status >= 400) {
            console.error(`Unexpected response status from AniDB: ${response.status} ${response.statusText}`);
            return null;
        }

        // Extract the adbuin cookie from the first response
        const setCookieHeaders = response.headers.getSetCookie();
        
        if (setCookieHeaders && setCookieHeaders.length > 0) {
            // Consolidate cookies into a single cookie string
            const cookies = setCookieHeaders.map(cookie => {
                // Extract the cookie name and value (before the first semicolon)
                const parts = cookie.split(';');
                return parts[0].trim();
            });
            
            sessionCookie = cookies.join('; ');
            console.log('AniDB authentication successful');
            console.log(`Session cookie: ${sessionCookie}`);
            return sessionCookie;
        } else {
            console.error('No Set-Cookie headers found in redirect response');
            return null;
        }
    } catch (error) {
        console.error('Error authenticating with AniDB:', error.message);
        return null;
    }
}

/**
 * Ensures we have a valid AniDB session cookie
 * Since this is called from within already-queued functions, we don't need to queue authentication
 * @returns {Promise<string|null>} Session cookie string
 */
async function ensureSession() {
    // If we already have a session cookie, return it
    if (sessionCookie) {
        return sessionCookie;
    }
    
    // If authentication is already in progress, wait for it
    if (authenticating) {
        // Wait a bit and check again
        while (authenticating) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return sessionCookie;
    }
    
    // Authenticate (we're already inside a queued operation, so no need to queue again)
    authenticating = true;
    try {
        const cookie = await authenticateAnidb();
        if (cookie) {
            sessionCookie = cookie;
        }
        return sessionCookie;
    } finally {
        authenticating = false;
    }
}

/**
 * Gets headers with session cookie for AniDB requests
 * @returns {Promise<Object>} Headers object with User-Agent and Cookie
 */
async function getAnidbHeaders() {
    const cookie = await ensureSession();
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    
    if (cookie) {
        headers['Cookie'] = cookie;
    }
    
    return headers;
}

/**
 * Searches for an anime on AniDB and extracts the AniDB ID from the redirect URL
 * @param {string} animeTitle - Title of the anime to search for
 * @returns {Promise<number|null>} AniDB ID if found, null otherwise
 */
export async function getAnidbID(animeTitle) {
    return anidbQueue.add(() => getAnidbIDByType(animeTitle, 'anime'));
}

/**
 * Searches for a group on AniDB and extracts the AniDB ID from the redirect URL
 * @param {string} groupName - Name of the group to search for
 * @returns {Promise<number|null>} AniDB ID if found, null otherwise
 */
export async function getAnidbGroupID(groupName) {
    return anidbQueue.add(() => getAnidbIDByType(groupName, 'group'));
}

/**
 * Searches for an item on AniDB by type (anime or group) and extracts the AniDB ID from the redirect URL
 * @param {string} searchTerm - Term to search for
 * @param {string} type - Type of search: 'anime' or 'group'
 * @returns {Promise<number|null>} AniDB ID if found, null otherwise
 */
async function getAnidbIDByType(searchTerm, type = 'anime') {
    if (!searchTerm || !searchTerm.trim()) {
        return null;
    }

    // URL encode the search term and construct search URL early
    const encodedTerm = encodeURIComponent(searchTerm.trim());
    const searchUrl = `https://anidb.net/${type}/?adb.search=${encodedTerm}&do.search=1`;
    
    try {
        // Check cache first
        const cachedResult = getCachedAnidbResult(searchUrl);
        if (cachedResult !== undefined) {
            console.log(`Using cached AniDB result for ${type}: ${searchTerm} -> ${cachedResult || 'not found'}`);
            return cachedResult;
        }
        
        console.log(`Searching AniDB for ${type}: ${searchTerm}`);
        
        // Get headers with session cookie
        const headers = await getAnidbHeaders();
        
        // First try with redirect: 'manual' to capture the Location header
        const response = await fetch(searchUrl, {
            method: 'GET',
            redirect: 'manual',
            headers
        });

        let redirectUrl = null;
        
        // Check if we got a redirect (3xx status code)
        if (response.status >= 300 && response.status < 400) {
            redirectUrl = response.headers.get('location');
            // If location is relative, make it absolute
            if (redirectUrl && redirectUrl.startsWith('/')) {
                redirectUrl = 'https://anidb.net' + redirectUrl;
            }
        }
        
        // If no redirect header, try following redirects to get the final URL
        let htmlResponse = null;
        if (!redirectUrl) {
            const followResponse = await fetch(searchUrl, {
                method: 'GET',
                redirect: 'follow',
                headers
            });
            
            if (followResponse.ok) {
                redirectUrl = followResponse.url;
                // Store response for potential HTML parsing if redirect doesn't work out
                htmlResponse = followResponse;
            }
        }
        
        // Extract AniDB ID from the redirect URL
        let extractedAnidbID = null;
        if (redirectUrl) {
            const match = redirectUrl.match(`/${type}/(\\d+)`);
            if (match && match[1]) {
                extractedAnidbID = parseInt(match[1], 10);
                console.log(`Found AniDB ID: ${extractedAnidbID} for ${type} ${searchTerm}`);
                // Store in cache before returning
                storeAnidbCache(searchUrl, extractedAnidbID);
                return extractedAnidbID;
            }
        }

        // If no valid redirect URL found and type is group, parse HTML to find the group in the results table
        // Use htmlResponse if available, otherwise use the original response if it's OK
        const responseToParse = htmlResponse || (response.ok ? response : null);
        if (!extractedAnidbID && type === 'group' && responseToParse) {
            try {
                const html = await responseToParse.text();
                const $ = cheerio.load(html);
                
                // Find the table with class grouplist
                const grouplistTable = $('table.grouplist');
                
                if (grouplistTable.length > 0) {
                    // Search through table rows
                    let foundAnidbID = null;
                    
                    grouplistTable.find('tr').each((index, row) => {
                        const $row = $(row);
                        
                        // Find td with data-label="Title" that contains an anchor
                        const $titleTd = $row.find('td[data-label="Title"]');
                        
                        if ($titleTd.length > 0) {
                            const $anchor = $titleTd.find('a');
                            
                            if ($anchor.length > 0) {
                                const anchorText = $anchor.text().trim();
                                
                                // Check if the anchor text matches the search term
                                if (anchorText === searchTerm.trim()) {
                                    const href = $anchor.attr('href');
                                    
                                    if (href) {
                                        // Extract anidbID from href (format: "/group/3577")
                                        const match = href.match(/\/group\/(\d+)/);
                                        if (match && match[1]) {
                                            foundAnidbID = parseInt(match[1], 10);
                                            return false; // Break out of each loop
                                        }
                                    }
                                }
                            }
                        }
                    });
                    
                    if (foundAnidbID !== null) {
                        console.log(`Found AniDB ID: ${foundAnidbID} for group ${searchTerm} from search results`);
                        // Store in cache before returning
                        storeAnidbCache(searchUrl, foundAnidbID);
                        return foundAnidbID;
                    }
                }
            } catch (parseError) {
                console.error(`Error parsing HTML for group search: ${parseError.message}`);
            }
        }

        console.log(`No AniDB ID found for ${type}: ${searchTerm}`);
        // Store null result in cache before returning
        storeAnidbCache(searchUrl, null);
        return null;
    } catch (error) {
        console.error(`Error searching AniDB for ${type} ${searchTerm}:`, error.message);
        // Store null result in cache even on error
        storeAnidbCache(searchUrl, null);
        return null;
    }
}

/**
 * Internal function to fetch episode by CRC (not queued, used internally)
 * @param {number} groupAnidbID - AniDB ID of the subgroup/group
 * @param {number} animeAnidbID - AniDB ID of the anime
 * @param {string} crcHash - CRC hash to search for (case-insensitive)
 * @returns {Promise<{episode: number|null, season: number|null}>} Episode and season information if available
 */
async function getEpisodeByCRCInternal(groupAnidbID, animeAnidbID, crcHash) {
    if (!groupAnidbID || !animeAnidbID || !crcHash) {
        return { episode: null, season: null };
    }

    const releaseUrl = `https://anidb.net/group/${groupAnidbID}/anime/${animeAnidbID}/release`;
    
    try {
        // Check cache first (6 hours expiration for release pages)
        const sixHoursInMs = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
        const cachedHtml = getCachedAnidbHtml(releaseUrl, sixHoursInMs);
        let releasePageHtml = null;
        let usedCache = false;
        
        if (cachedHtml) {
            console.log(`Using cached HTML for AniDB release page: ${releaseUrl}`);
            releasePageHtml = cachedHtml;
            usedCache = true;
        } else {
            console.log(`Fetching AniDB release page: ${releaseUrl} for CRC: ${crcHash}`);
            
            // Get headers with session cookie
            const headers = await getAnidbHeaders();

            const response = await fetch(releaseUrl, {
                method: 'GET',
                headers
            });

            if (!response.ok) {
                console.log(`Failed to fetch AniDB release page: ${response.status} ${response.statusText}`);
                // Store null result in cache
                storeAnidbCache(releaseUrl, null, null);
                return { episode: null, season: null };
            }

            const html = await response.text();
            releasePageHtml = html;
            
            // Store the full release page HTML in cache for future use
            storeAnidbCache(releaseUrl, null, releasePageHtml);
        }
        
        if (!releasePageHtml) {
            return { episode: null, season: null };
        }

        // Parse the cached or newly fetched HTML
        const $ = cheerio.load(releasePageHtml);
        const filelistTable = $('table.filelist').length > 0 
            ? $('table.filelist') 
            : $('table'); // Fallback to any table if class not found

        if (filelistTable.length === 0) {
            console.log(`Url: ${releaseUrl}`);
            console.log(`No .filelist table found on AniDB release page`);
            if (!usedCache) {
                storeAnidbCache(releaseUrl, null, releasePageHtml);
            }

            // Attempt to extract season even if no episode table is available
            const seasonFallback = extractSeasonFromAniDBHtml($, animeAnidbID);
            return { episode: null, season: seasonFallback };
        }

        const season = extractSeasonFromAniDBHtml($, animeAnidbID);

        // Search through table rows
        let foundEpisode = null;
        const normalizedCrc = crcHash.toUpperCase();
        
        filelistTable.find('tr').each((index, row) => {
            const $row = $(row);
            
            // Find td.epno and td.crc in this row
            const $epno = $row.find('td.epno');
            const $crc = $row.find('td.crc');
            
            if ($epno.length > 0 && $crc.length > 0) {
                const rowCrc = $crc.text().trim().toUpperCase();
                const episodeText = $epno.text().trim();
                
                // Check if CRC matches
                if (rowCrc === normalizedCrc) {
                    // Extract episode number from episode text
                    // Episode text might be like "1", "01", "Episode 1", etc.
                    const episodeMatch = episodeText.match(/\d+/);
                    if (episodeMatch) {
                        const episodeNum = parseInt(episodeMatch[0], 10);
                        if (!Number.isNaN(episodeNum)) {
                            foundEpisode = episodeNum;
                            return false; // Break out of each loop
                        }
                    }
                }
            }
        });
        
        if (foundEpisode !== null) {
            console.log(`Found episode ${foundEpisode} for CRC ${crcHash} on AniDB${season !== null ? ` (season ${season})` : ''}`);
            return { episode: foundEpisode, season };
        } else {
            console.log(`No episode found for CRC ${crcHash} on AniDB release page`);
            return { episode: null, season };
        }
    } catch (error) {
        console.error(`Error fetching AniDB release page for CRC ${crcHash}:`, error.message);
        return { episode: null, season: null };
    }
}

/**
 * Extracts the season information from an AniDB release page HTML document
 * @param {cheerio.CheerioAPI} $ - Parsed cheerio instance for the release page
 * @param {number} fallbackAnimeAnidbID - AniDB ID provided as function input to use as fallback
 * @returns {number|null} Season number if located in the local database, otherwise null
 */
function extractSeasonFromAniDBHtml($, fallbackAnimeAnidbID) {
    if (!$) {
        return null;
    }

    let animeIdFromHtml = null;

    try {
        const animeAnchor = $('#layout-main .anime .value a').first();
        if (animeAnchor.length > 0) {
            const href = animeAnchor.attr('href') || '';
            const match = href.match(/\/anime\/(\d+)/);
            if (match && match[1]) {
                const parsedId = parseInt(match[1], 10);
                if (!Number.isNaN(parsedId)) {
                    animeIdFromHtml = parsedId;
                }
            }
        }
    } catch (parseError) {
        console.warn(`Failed to extract AniDB anime ID from release page HTML: ${parseError.message}`);
    }

    const targetAnimeId = animeIdFromHtml || fallbackAnimeAnidbID;

    if (!targetAnimeId) {
        return null;
    }

    try {
        const season = getAnimeSeasonByAnidbId(targetAnimeId);
        return season ?? null;
    } catch (dbError) {
        console.warn(`Failed to fetch season for AniDB ID ${targetAnimeId} from database: ${dbError.message}`);
        return null;
    }
}

/**
 * Fetches the release page for a group/anime combination and finds episode number by CRC hash
 * @param {number} groupAnidbID - AniDB ID of the subgroup/group
 * @param {number} animeAnidbID - AniDB ID of the anime
 * @param {string} crcHash - CRC hash to search for (case-insensitive)
 * @returns {Promise<{episode: number|null, season: number|null}>} Episode and season information if available
 */
export async function getEpisodeByCRC(groupAnidbID, animeAnidbID, crcHash) {
    return anidbQueue.add(() => getEpisodeByCRCInternal(groupAnidbID, animeAnidbID, crcHash));
}

