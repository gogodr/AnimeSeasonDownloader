import Parser from 'rss-parser';
import { NYAA_RSS_BASE_URL } from '../config/constants.js';
import { sleep } from '../utils/helpers.js';

const parser = new Parser();
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds

/**
 * Checks if an error is a 429 (Too Many Requests) error
 * @param {Error} error - The error object to check
 * @returns {boolean} True if the error is a 429 error
 */
function isRateLimitError(error) {
    // rss-parser may throw errors with different structures
    // Check common error response patterns
    return (
        error?.status === 429 ||
        error?.statusCode === 429 ||
        error?.response?.status === 429 ||
        error?.code === 429 ||
        (error?.message && error.message.includes('429'))
    );
}

/**
 * Searches for torrents on Nyaa.si based on anime title
 * Handles 429 rate limit errors by retrying after 2 seconds
 * @param {string} animeTitle - Title of the anime to search for
 * @param {number} retryCount - Current retry attempt (internal use)
 * @returns {Promise<Object>} RSS feed data
 */
export async function torrentSearch(animeTitle, retryCount = 0) {
    const url = NYAA_RSS_BASE_URL + 
        (encodeURIComponent(animeTitle) + "+1080p").replaceAll("%20", "+") + 
        "&c=1_2&f=0";
    console.log(`Fetching RSS feed from: ${url}`);
    
    try {
        const response = await parser.parseURL(url);
        await sleep(500); // to avoid rate limiting
        return response;
    } catch (error) {
        // Check if it's a rate limit error (429)
        if (isRateLimitError(error) && retryCount < MAX_RETRIES) {
            const attempt = retryCount + 1;
            console.log(`Rate limit (429) encountered. Retrying in 2 seconds... (Attempt ${attempt}/${MAX_RETRIES})`);
            await sleep(RETRY_DELAY_MS);
            return torrentSearch(animeTitle, retryCount + 1);
        }
        
        // If not a rate limit error or max retries reached, throw the error
        console.error(`Error fetching RSS feed: ${error.message}`);
        throw error;
    }
}

