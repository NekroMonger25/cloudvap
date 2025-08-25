const axios = require('axios');
const TMDB_API_KEY = process.env.TMDB_API_KEY;

function defineStreamHandler(builder) {
    builder.defineStreamHandler(async ({ type, id, config }) => {
        console.log(`Richiesta stream per: type=${type}, id=${id}`);

        if (!TMDB_API_KEY) {
            console.error("ERRORE: TMDB_API_KEY non impostata.");
            return Promise.resolve({ streams: [] });
        }

        let effectiveImdbId = null;
        let effectiveTmdbId = null;
        let season = null;
        let episode = null;

        const idParts = id.split(':');
        const firstPart = idParts[0];

        if (type === 'movie') {
            if (idParts.length === 1 && firstPart.startsWith('tt')) {
                effectiveImdbId = firstPart;
            } else if (idParts.length === 2) {
                if (firstPart === 'imdb') {
                    effectiveImdbId = idParts[1];
                } else if (firstPart === 'tmdb') {
                    effectiveTmdbId = idParts[1];
                } else if (firstPart.startsWith('tt')) {
                    effectiveImdbId = firstPart;
                } else {
                    console.warn(`Formato ID film non riconosciuto: ${id}`);
                    return Promise.resolve({ streams: [] });
                }
            } else {
                console.warn(`ID film non valido: ${id}`);
                return Promise.resolve({ streams: [] });
            }
        } else if (type === 'series') {
            if (idParts.length === 4 && firstPart === 'imdb') {
                effectiveImdbId = idParts[1];
                season = idParts[2];
                episode = idParts[3];
            } else if (idParts.length === 4 && firstPart === 'tmdb') {
                effectiveTmdbId = idParts[1];
                season = idParts[2];
                episode = idParts[3];
            } else if (idParts.length === 3 && firstPart.startsWith('tt')) {
                effectiveImdbId = firstPart;
                season = idParts[1];
                episode = idParts[2];
            } else {
                console.warn(`ID serie non valido: ${id}`);
                return Promise.resolve({ streams: [] });
            }
        } else {
            console.warn(`Tipo media non supportato: ${type}`);
            return Promise.resolve({ streams: [] });
        }

        // Se abbiamo imdbId ma non tmdbId, convertiamolo
        if (effectiveImdbId && !effectiveTmdbId) {
            try {
                console.log(`Convertiamo IMDb ID ${effectiveImdbId} a TMDb ID`);
                const findResponse = await axios.get(`https://api.themoviedb.org/3/find/${effectiveImdbId}`, {
                    params: {
                        api_key: TMDB_API_KEY,
                        external_source: 'imdb_id'
                    }
                });
                const results = type === 'movie' ? findResponse.data.movie_results : findResponse.data.tv_results;
                if (results && results.length > 0) {
                    effectiveTmdbId = results[0].id.toString();
                    console.log(`IMDb ID ${effectiveImdbId} convertito a TMDb ID ${effectiveTmdbId}`);
                } else {
                    console.warn(`Nessun TMDb ID trovato per IMDb ID ${effectiveImdbId}`);
                    return Promise.resolve({ streams: [] });
                }
            } catch (error) {
                console.error(`Errore conversione IMDb ID ${effectiveImdbId}: ${error.message}`);
                return Promise.resolve({ streams: [] });
            }
        }

        if (!effectiveTmdbId) {
            console.warn(`Impossibile determinare TMDb ID per ${id}`);
            return Promise.resolve({ streams: [] });
        }

        let streamUrl = '';
        let streamTitle = 'Guarda (Direct)';

        if (type === 'movie') {
            streamUrl = `https://vixsrc.to/movie/${effectiveTmdbId}`;
        } else if (type === 'series') {
            if (!season || !episode) {
                console.warn(`Manca stagione o episodio per serie TMDb ID ${effectiveTmdbId}`);
                return Promise.resolve({ streams: [] });
            }
            streamUrl = `https://vixsrc.to/tv/${effectiveTmdbId}/${season}/${episode}`;
        }

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

        return Promise.resolve({ streams });
    });
}

module.exports = defineStreamHandler;
