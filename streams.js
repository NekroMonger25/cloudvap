// Questo modulo definisce il gestore degli stream per l'addon
const axios = require('axios'); // Necessario per chiamate API aggiuntive

const TMDB_API_KEY = process.env.TMDB_API_KEY; // Assicurati che sia disponibile
const MEDIAFLOW_PROXY_URL = process.env.MEDIAFLOW_PROXY_URL;
const MEDIAFLOW_PROXY_API_PASSWORD = process.env.API_PASSWORD; // Corretto per corrispondere al file .env

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
        if (!MEDIAFLOW_PROXY_URL || !MEDIAFLOW_PROXY_API_PASSWORD) {
            console.error("ERRORE: MEDIAFLOW_PROXY_URL o API_PASSWORD non sono impostate nelle variabili d'ambiente.");
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

        // Ora, se abbiamo effectiveImdbId, convertiamolo in effectiveTmdbId
        if (effectiveImdbId && !effectiveTmdbId) {
            try {
                console.log(`Tentativo di convertire IMDb ID ${effectiveImdbId} a TMDB ID`);
                const findResponse = await axios.get(`https://api.themoviedb.org/3/find/${effectiveImdbId}`, {
                    params: { api_key: TMDB_API_KEY, external_source: 'imdb_id' }
                });
                const results = type === 'movie' ? findResponse.data.movie_results : findResponse.data.tv_results;
                if (results && results.length > 0) {
                    effectiveTmdbId = results[0].id.toString(); // Assicurati sia stringa
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

        let vixsrcUrl;
        let streamTitle = "Guarda (Proxy)"; // Titolo di fallback

        if (type === 'movie') {
            // Assumiamo che l'URL per i film su vixsrc.to sia /movie/TMDB_ID/
            vixsrcUrl = `https://vixsrc.to/movie/${effectiveTmdbId}/`;
            try {
                const movieDetails = await axios.get(`https://api.themoviedb.org/3/movie/${effectiveTmdbId}`, {
                    params: { api_key: TMDB_API_KEY, language: 'it-IT' }
                });
                if (movieDetails.data && movieDetails.data.title) {
                    streamTitle = movieDetails.data.title;
                }
            } catch (e) {
                console.warn(`Impossibile recuperare il titolo del film TMDB ID ${effectiveTmdbId}: ${e.message}`);
            }
        } else if (type === 'series') {
            // season e episode dovrebbero essere stati popolati correttamente
            if (!season || !episode) {
                console.error(`Stagione o episodio mancanti per serie con TMDB ID ${effectiveTmdbId} dall'ID originale ${id}`);
                return Promise.resolve({ streams: [] });
            }
            try {
                const episodeDetails = await axios.get(`https://api.themoviedb.org/3/tv/${effectiveTmdbId}/season/${season}/episode/${episode}`, {
                    params: { api_key: TMDB_API_KEY, language: 'it-IT' }
                });
                if (episodeDetails.data && episodeDetails.data.name) {
                    streamTitle = episodeDetails.data.name;
                } else {
                    streamTitle = `S${season} E${episode}`; // Fallback se il nome dell'episodio non è disponibile
                }
            } catch (e) {
                console.warn(`Impossibile recuperare il titolo dell'episodio TMDB ID ${effectiveTmdbId} S${season}E${episode}: ${e.message}`);
                streamTitle = `S${season} E${episode}`; // Fallback in caso di errore
            }
            vixsrcUrl = `https://vixsrc.to/tv/${effectiveTmdbId}/${season}/${episode}/`;
        } else {
            console.warn(`Tipo di media non supportato per lo streaming: ${type}`);
            return Promise.resolve({ streams: [] });
        }

        const encodedVixsrcUrl = encodeURIComponent(vixsrcUrl);

        // Costruiamo l'URL per mediaflow-proxy basandoci sulla struttura dei tuoi log
        // GET /extractor/video?host=VixCloud&d=<URL_VIXSRC>&redirect_stream=true&additionalProp1={}&api_password=123456
        const proxyStreamUrl = `${MEDIAFLOW_PROXY_URL}/extractor/video?host=VixCloud&d=${encodedVixsrcUrl}&redirect_stream=true&additionalProp1=%7B%7D&api_password=${MEDIAFLOW_PROXY_API_PASSWORD}`;

        const streams = [
            {
                name: "Vixsrc (Proxy)", // Nome della sorgente visualizzato in Stremio
                url: proxyStreamUrl,
                title: streamTitle, // Titolo visualizzato per lo stream specifico
                // Stremio dovrebbe gestire il redirect da proxyStreamUrl.
                // Se il proxy non imposta Content-Type corretto o se ci sono problemi con i CORS,
                // potresti aver bisogno di behaviorHints, ma proviamo prima senza.
                // Esempio:
                behaviorHints: {
                   proxyHeaders: { "request": { "Referer": "https://vixsrc.to/" } },
                //    notWebReady: true // Se il link non è direttamente riproducibile nel browser
                 }
            }
        ];

        return Promise.resolve({ streams: streams });
    });
}

module.exports = defineStreamHandler;
