/**
 * Determines current season based on date
 * @returns {string} Current season
 */
export function getCurrentSeason() {
    const today = new Date();
    const month = today.getMonth();
    if (month < 2) return "WINTER";
    if (month < 5) return "SPRING";
    if (month < 8) return "SUMMER";
    return "FALL";
}

