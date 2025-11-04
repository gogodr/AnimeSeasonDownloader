/**
 * Anime data template structure
 */
export const animeTemplate = {
    id: 0,
    idMal: 0,
    episodes: [
        {
            episode: 0,
            airingAt: 0,
            torrents: [{
                url: "",
                name: "",
                subGroup: "",
            }]
        }
    ],
    startDate: { year: 0, month: 0, day: 0 },
    image: "",
    title: { romaji: "", english: "", native: "" },
    description: "",
    genres: [""],
};

/**
 * Creates an anime object from media data
 * @param {Object} media - Media data from AniList API
 * @returns {Object} Anime object
 */
export function createAnimeFromMedia(media) {
    return {
        id: media.id,
        idMal: media.idMal,
        startDate: new Date(media.startDate.year, media.startDate.month, media.startDate.day),
        image: media.coverImage.extraLarge,
        title: media.title,
        description: media.description,
        genres: media.genres,
        episodes: []
    };
}

