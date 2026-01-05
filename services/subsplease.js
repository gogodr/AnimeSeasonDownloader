import * as cheerio from 'cheerio';

const SUBSLEASE_SHOWS_URL = 'https://subsplease.org/shows/';

/**
 * Scrapes anime titles from SubsPlease shows page
 * @returns {Promise<Array<string>>} Array of anime titles
 */
export async function getAnimeAlternateTitles() {
    try {
        const response = await fetch(SUBSLEASE_SHOWS_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        const titles = [];
        
        // Find all div.all-shows-link > a elements and extract their text
        $('div.all-shows-link > a').each((index, element) => {
            const title = $(element).text().trim();
            if (title) {
                titles.push(title);
            }
        });
        
        console.log(`Scraped ${titles.length} anime titles from SubsPlease`);
        return titles;
    } catch (error) {
        console.error(`Error scraping SubsPlease titles: ${error.message}`);
        throw error;
    }
}
