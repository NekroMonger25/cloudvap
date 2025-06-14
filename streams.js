// Questo modulo definisce il gestore degli stream per l'addon

const MEDIAFLOW_PROXY_URL = process.env.MEDIAFLOW_PROXY_URL;
const MEDIAFLOW_PROXY_API_PASSWORD = process.env.API_PASSWORD; // Corretto per corrispondere al file .env

/**
 * Definisce il gestore degli stream sull'istanza del builder dell'addon.
 * @param {import('stremio-addon-sdk').addonBuilder} builder - L'istanza di addonBuilder.
 */
function defineStreamHandler(builder) {
    builder.defineStreamHandler(async ({ type, id, config }) => {
        console.log(`Richiesta stream per: type=${type}, id=${id}`);

        if (!MEDIAFLOW_PROXY_URL || !MEDIAFLOW_PROXY_API_PASSWORD) { // La variabile qui è corretta
            console.error("ERRORE: MEDIAFLOW_PROXY_URL o MEDIAFLOW_PROXY_API_PASSWORD non sono impostate nelle variabili d'ambiente.");
            return Promise.resolve({ streams: [] });
        }

        // L'ID per i film è "tmdb:MOVIE_ID"
        // L'ID per le serie è "tmdb:SERIES_ID:SEASON_NUMBER:EPISODE_NUMBER"
        const idParts = id.split(':');
        if (idParts[0] !== 'tmdb' || idParts.length < 2) {
            console.warn(`ID stream non valido o non supportato: ${id}`);
            return Promise.resolve({ streams: [] });
        }

        const tmdbId = idParts[1];
        let vixsrcUrl;
        let streamTitle = "Guarda (Proxy)";

        if (type === 'movie') {
            if (idParts.length !== 2) {
                console.warn(`ID film non valido: ${id}`);
                return Promise.resolve({ streams: [] });
            }
            // Assumiamo che l'URL per i film su vixsrc.to sia /movie/TMDB_ID/
            // Potrebbe essere necessario adattarlo se il pattern è diverso (es. /film/)
            vixsrcUrl = `https://vixsrc.to/movie/${tmdbId}/`;
            // Potresti voler recuperare il titolo del film da TMDB per un nome stream più descrittivo
            // ma per ora usiamo un titolo generico.
        } else if (type === 'series') {
            if (idParts.length !== 4) {
                console.warn(`ID serie non valido: ${id}`);
                return Promise.resolve({ streams: [] });
            }
            const season = idParts[2];
            const episode = idParts[3];
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