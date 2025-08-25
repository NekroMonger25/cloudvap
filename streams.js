const axios = require('axios'); // Necessario per chiamate API aggiuntive
const TMDB_API_KEY = process.env.TMDB_API_KEY; // Assicurati che sia disponibile

/**
 * Definisce il gestore degli stream sull'istanza del builder dell'addon.
 * @param {import('stremio-addon-sdk').addonBuilder} builder - L'istanza di addonBuilder.
 */
function defineStreamHandler(builder) {
    builder.defineStreamHandler(async ({ type, id, config }) => {
        console.log(`Richiesta stream per: type=${type}, id=${id}`);

        if (!TMDB_API_KEY) {
            console.error("ERRORE: TMDB_API_KEY non impostata per la conversione ID in streams.js.");
            return Promise.resolve({ streams: [] });
        }

        const idParts = id.split(':');
        let effectiveImdbId = null;
        let effectiveTmdbId = null;
        let season = null;
        let episode = null;
        const firstPart = idParts[0];

        if (type === 'movie') {
            if (idParts.length === 1 && firstPart.startsWith('tt')) { // es. "tt12345"
                effectiveImdbId = firstPart;
            } else if (idParts.length === 2) {
                if (firstPart === 'tmdb') { // es. "tmdb:67890"
                    effectiveTmdbId = idParts[1];
                } else if (firstPart === 'imdb') { // es. "imdb:tt12345"
                    effectiveImdbId = idParts[1];
                } else if (firstPart.startsWith('tt')) {
                    effectiveImdbId = firstPart;
                    console.warn(`Formato ID film con ':' dopo tt-prefix non standard: ${id}, usando ${firstPart} come IMDb ID`);
                } else {
                    console.warn(`Formato ID film non riconosciuto: ${id}`);
                    return Promise.resolve({ streams: [] });
                }
            } else {
                console.warn(`ID film non valido per lo streaming: ${id}`);
                return Promise.resolve({ streams: [] });
            }
        } else if (type === 'series') {
            if (idParts.length === 4 && firstPart === 'tmdb') { // tmdb:SERIES_ID:S:E
                effectiveTmdbId = idParts[1];
                season = idParts[2];
                episode = idParts[3];
            } else if (idParts.length === 4 && firstPart === 'imdb') { // imdb:IMDB_ID:S:E
                effectiveImdbId = idParts[1];
                season = idParts[2];
                episode = idParts[3];
            } else if (idParts.length === 3 && firstPart.startsWith('tt')) { // IMDB_ID:S:E (es. tt12345:1:1)
                effectiveImdbId = firstPart;
                season = idParts[1];
                episode = idParts[2];
            } else {
                console.warn(`ID serie non valido per lo streaming: ${id}`);
                return Promise.resolve({ streams: [] });
            }
        } else {
            console.warn(`Tipo di media non supportato per lo streaming: ${type}`);
            return Promise.resolve({ streams: [] });
        }

        // Convertiamo IMDb ID in TMDB ID se necessario
        if (effectiveImdbId && !effectiveTmdbId) {
            try {
                console.log(`Tentativo di convertire IMDb ID ${effectiveImdbId} a TMDB ID`);
                const findResponse = await axios.get(`https://api.themoviedb.org/3/find/${effectiveImdbId}`, {
                    params: { api_key: TMDB_API_KEY, external_source: 'imdb_id' }
                });
                const results = type === 'movie' ? findResponse.data.movie_results : findResponse.data.tv_results;
                if (results && results.length > 0) {
                    effectiveTmdbId = results[0].id.toString();
                    console.log(`IMDb ID ${effectiveImdbId} convertito a TMDB ID ${effectiveTmdbId}`);
                } else {
                    console.warn(`Nessun TMDB ID trovato per IMDb ID ${effectiveImdbId}`);
                    return Promise.resolve({ streams: [] });
                }
            } catch (error) {
                console.error(`Errore durante la conversione IMDb ID ${effectiveImdbId}:`, error.message);
                return Promise.resolve({ streams: [] });
            }
        }

        if (!effectiveTmdbId) {
            console.warn(`Impossibile determinare TMDB ID per ${id}`);
            return Promise.resolve({ streams: [] });
        }

        let streamUrl;
        let streamTitle = "Guarda (Direct)";

        if (type === 'movie') {
            streamUrl = `https://vixsrc.to/movie/${effectiveTmdbId}`;
        } else if (type === 'series') {
            if (!season || !episode) {
                console.error(`Stagione o episodio mancanti per serie con TMDB ID ${effectiveTmdbId} dall'ID originale ${id}`);
                return Promise.resolve({ streams: [] });
            }
            streamUrl = `https://vixsrc.to/tv/${effectiveTmdbId}/${season}/${episode}`;
        }

        // Aggiunto log per l'URL finale costruito
        console.log(`URL stream finale costruito: ${streamUrl}`);

        const streams = [
            {
                name: "Vixsrc (Direct)",
                url: streamUrl,
                title: streamTitle,
                behaviorHints: {
                    notWebReady: true
                }
            }
        ];

        return Promise.resolve({ streams: streams });
    });
}

module.exports = defineStreamHandler;
