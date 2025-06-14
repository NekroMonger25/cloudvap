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

        // L'ID per i film è "tmdb:MOVIE_ID"
        // L'ID per le serie è "tmdb:SERIES_ID:SEASON_NUMBER:EPISODE_NUMBER"
        const idParts = id.split(':');
        let sourceId = idParts[0];
        let entityId = idParts[1];
        let season, episode;

        if (type === 'series') {
            if (idParts.length === 4) { // tmdb:series_id:s:e o imdb:series_id:s:e
                season = idParts[2];
                episode = idParts[3];
            } else if (idParts.length === 2 && sourceId.startsWith('tt')) { // imdb:series_id (senza S:E, meno comune per stream)
                 console.warn(`ID serie IMDb ricevuto senza stagione/episodio: ${id}. Non si può procedere.`);
                 return Promise.resolve({ streams: [] });
            } else {
                console.warn(`ID serie non valido per lo streaming: ${id}`);
                return Promise.resolve({ streams: [] });
            }
        } else if (type === 'movie') {
            if (idParts.length !== 2) {
                 console.warn(`ID film non valido per lo streaming: ${id}`);
                 return Promise.resolve({ streams: [] });
            }
        }

        let tmdbId = null;

        if (sourceId === 'tmdb') {
            tmdbId = entityId;
        } else if (sourceId.startsWith('tt')) { // Assumiamo sia un ID IMDb
            try {
                console.log(`Tentativo di convertire IMDb ID ${entityId} a TMDB ID`);
                const findResponse = await axios.get(`https://api.themoviedb.org/3/find/${entityId}`, {
                    params: { api_key: TMDB_API_KEY, external_source: 'imdb_id', language: 'it-IT' }
                });
                const results = type === 'movie' ? findResponse.data.movie_results : findResponse.data.tv_results;
                if (results && results.length > 0) {
                    tmdbId = results[0].id;
                    console.log(`IMDb ID ${entityId} convertito a TMDB ID ${tmdbId}`);
                } else {
                    console.warn(`Nessun TMDB ID trovato per IMDb ID ${entityId}`);
                    return Promise.resolve({ streams: [] });
                }
            } catch (error) {
                console.error(`Errore durante la conversione IMDb ID ${entityId}:`, error.message);
                return Promise.resolve({ streams: [] });
            }
        } else {
            console.warn(`ID stream non valido o non supportato: ${id}`);
            return Promise.resolve({ streams: [] });
        }

        if (!tmdbId) {
            console.warn(`Impossibile determinare TMDB ID per ${id}`);
            return Promise.resolve({ streams: [] });
        }

        let vixsrcUrl;
        let streamTitle = "Guarda (Proxy)";

        if (type === 'movie') {
            // Assumiamo che l'URL per i film su vixsrc.to sia /movie/TMDB_ID/
            // Potrebbe essere necessario adattarlo se il pattern è diverso (es. /film/)
            vixsrcUrl = `https://vixsrc.to/movie/${tmdbId}/`;
            // Potresti voler recuperare il titolo del film da TMDB per un nome stream più descrittivo
            // ma per ora usiamo un titolo generico.
        } else if (type === 'series') {
            if (idParts.length !== 4) {
                // Questa condizione ora è gestita sopra durante il parsing dell'ID
            }
            vixsrcUrl = `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}/`;
            streamTitle = `S${season} E${episode} (Proxy)`;
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
                name: "VixSRC (Proxy)", // Nome della sorgente visualizzato in Stremio
                url: proxyStreamUrl,
                title: streamTitle, // Titolo visualizzato per lo stream specifico
                // Stremio dovrebbe gestire il redirect da proxyStreamUrl.
                // Se il proxy non imposta Content-Type corretto o se ci sono problemi con i CORS,
                // potresti aver bisogno di behaviorHints, ma proviamo prima senza.
                // Esempio:
                // behaviorHints: {
                //    proxyHeaders: { "request": { "Referer": "https://vixsrc.to/" } },
                //    notWebReady: true // Se il link non è direttamente riproducibile nel browser
                // }
            }
        ];

        return Promise.resolve({ streams: streams });
    });
}

module.exports = defineStreamHandler;