import * as cheerio from 'cheerio';
import { NYAA_BASE_URL } from '../config/constants.js';
import { sleep } from '../utils/helpers.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds

/**
 * Checks if an error is a 429 (Too Many Requests) error
 * @param {Error} error - The error object to check
 * @returns {boolean} True if the error is a 429 error
 */
function isRateLimitError(error) {
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
 * Parses HTML content and extracts torrent items
 * @param {string} html - HTML content to parse
 * @returns {Array} Array of torrent items
 */
function parseTorrentHTML(html) {
    const $ = cheerio.load(html);
    const items = [];
    
    // Find all rows in the torrent table (skip header row if it exists)
    // Select rows that have td elements (not th elements) to skip headers
    $('table.torrent-list tr').each((index, element) => {
        const $row = $(element);
        const $cells = $row.find('td');
        
        // Skip rows that don't have td elements (header rows have th)
        if ($cells.length === 0) {
            return;
        }
        
        // Second td has the torrent title (may be in a link or other nested element)
        const $titleCell = $cells.eq(1);
        // Try to find a link first, otherwise get all text
        const titleLink = $titleCell.find('a').last();
        const title = titleLink.length > 0 
            ? titleLink.text().trim() 
            : $titleCell.text().trim();
        
        // Third td has 2 a links, first one is the torrent relative url
        const $thirdCell = $cells.eq(2);
        const $firstLink = $thirdCell.find('a').first();
        const relativeUrl = $firstLink.attr('href');
        
        // Fourth td has the torrent date
        const dateText = $cells.eq(4).text().trim();
        
        if (title && relativeUrl) {
            // Append relative URL to NYAA_BASE_URL
            const fullLink = relativeUrl.startsWith('http') 
                ? relativeUrl 
                : NYAA_BASE_URL + relativeUrl;

            items.push({
                title: title,
                link: fullLink,
                date: new Date(dateText)
            });
        }
    });
    
    return items;
}

/**
 * Checks if the current page is the last page by looking at pagination HTML
 * @param {string} html - HTML content to check
 * @returns {boolean} True if this is the last page
 */
function isLastPage(html) {
    const $ = cheerio.load(html);
    const $pagination = $('ul.pagination');
    
    // If no pagination element exists, assume it's the only page (last page)
    if ($pagination.length === 0) {
        return true;
    }
    
    // Get the last li element inside the pagination ul
    const $lastLi = $pagination.find('li').last();
    
    // Check if the last li has both 'next' and 'disabled' classes
    return $lastLi.hasClass('next') && $lastLi.hasClass('disabled');
}

/**
 * Fetches a single page of torrents
 * @param {string} url - URL to fetch
 * @param {number} retryCount - Current retry attempt (internal use)
 * @returns {Promise<Object>} Object with items array and isLastPage flag
 */
async function fetchTorrentPage(url, retryCount = 0) {
    try {
        const response = await fetch(url);
        
        // Check for rate limit
        if (response.status === 429) {
            if (retryCount < MAX_RETRIES) {
                const attempt = retryCount + 1;
                console.log(`Rate limit (429) encountered. Retrying in 2 seconds... (Attempt ${attempt}/${MAX_RETRIES})`);
                await sleep(RETRY_DELAY_MS);
                return fetchTorrentPage(url, retryCount + 1);
            }
            throw new Error('Rate limit exceeded after max retries');
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        const items = parseTorrentHTML(html);
        const isLast = isLastPage(html);
        
        await sleep(500); // to avoid rate limiting

        console.log(`Fetched ${items.length} torrent(s) from ${url}`);
        return { items, isLastPage: isLast };
    } catch (error) {
        // Check if it's a rate limit error (429)
        if (isRateLimitError(error) && retryCount < MAX_RETRIES) {
            const attempt = retryCount + 1;
            console.log(`Rate limit (429) encountered. Retrying in 2 seconds... (Attempt ${attempt}/${MAX_RETRIES})`);
            await sleep(RETRY_DELAY_MS);
            return fetchTorrentPage(url, retryCount + 1);
        }
        
        // If not a rate limit error or max retries reached, throw the error
        console.error(`Error fetching HTML: ${error.message}`);
        throw error;
    }
}

/**
 * Searches for torrents on Nyaa.si based on anime title
 * Handles pagination and 429 rate limit errors by retrying after 2 seconds
 * @param {string} animeTitle - Title of the anime to search for
 * @returns {Promise<Object>} Object with items array (compatible with RSS format)
 */
export async function torrentSearch(animeTitle) {
    const baseUrl = NYAA_BASE_URL +'/?q=' + 
        (encodeURIComponent(animeTitle) + "+1080p").replaceAll("%20", "+") + 
        "&c=1_2&f=0";
    
    const allItems = [];
    let pageNumber = 1;
    
    while (true) {
        const url = pageNumber === 1 
            ? baseUrl 
            : baseUrl + `&p=${pageNumber}`;
        
        console.log(`Fetching HTML from page ${pageNumber}: ${url}`);
        
        const { items, isLastPage } = await fetchTorrentPage(url);
        
        if (items.length === 0) {
            // No more results, stop pagination
            break;
        }
        
        allItems.push(...items);
        
        // Check if this is the last page based on pagination HTML
        if (isLastPage) {
            break;
        }
        
        pageNumber++;
    }
    
    console.log(`Fetched ${allItems.length} total torrent(s) across ${pageNumber} page(s)`);
    
    // Return in RSS-compatible format
    return { items: allItems };
}

