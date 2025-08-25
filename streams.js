const axios = require('axios'); // Necessario per chiamate API aggiuntive
const TMDB_API_KEY = process.env.TMDB_API_KEY; // Necessaria solo se serve per recupero titoli

/**
 * Definisce il gestore degli stream sull'istanza del builder dell'addon.
 * @param {import('stremio-addon-sdk').addonBuilder} builder - L'istanza di addonBuilder.
 */
function defineStreamHandler(builder) {
    builder.defineStreamHandler(async ({ type, id, config }) => {
        console.log(`Richiesta stream per: type=${type}, id=${id}`);

        if (!id) {
            console.warn("ID mancante per la richiesta stream");
            return Promise.resolve({ streams: [] });
        }

        let imdbId = null;
        let season = null;
        let episode = null;

        const idParts = id.split(':');
        const firstPart = idParts[0];

        // Estrarre l'ID IMDb e rimuovere il prefisso "tt"
        function cleanImdbId(rawId) {
            return rawId.startsWith('tt') ? rawId.substring(2) : rawId;
        }

        if (type === 'movie') {
            if ((idParts.length === 1 && firstPart.startsWith('tt')) || (idParts.length === 2 && firstPart === 'imdb')) {
                imdbId = idParts.length === 1 ? firstPart : idParts[1];
                imdbId = cleanImdbId(imdbId);
            } else {
                console.warn(`ID film non valido per streaming (aspettato IMDb ID): ${id}`);
                return Promise.resolve({ streams: [] });
            }
        } else if (type === 'series') {
            if (idParts.length === 4 && firstPart === 'imdb') {
                imdbId = idParts[1];
                imdbId = cleanImdbId(imdbId);
                season = idParts[2];
                episode = idParts[3];
            } else if (idParts.length === 3 && firstPart.startsWith('tt')) {
                imdbId = firstPart;
                imdbId = cleanImdbId(imdbId);
                season = idParts[1];
                episode = idParts[2];
            } else {
                console.warn(`ID serie non valido per streaming: ${id}`);
                return Promise.resolve({ streams: [] });
            }
        } else {
            console.warn(`Tipo di media non supportato: ${type}`);
            return Promise.resolve({ streams: [] });
        }

        if (!imdbId) {
            console.warn("IMDb ID non determinato");
            return Promise.resolve({ streams: [] });
        }

        let streamUrl = '';
        let streamTitle = 'Guarda (Direct)';

        if (type === 'movie') {
            streamUrl = `https://vixsrc.to/movie/${imdbId}`;
            // Facoltativo: recupera titolo dal TMDb usando TMDB_API_KEY se necessario
        } else if (type === 'series') {
            if (!season || !episode) {
                console.warn("Stagione o episodio mancanti per serie");
                return Promise.resolve({ streams: [] });
            }
            streamUrl = `https://vixsrc.to/tv/${imdbId}/${season}/${episode}`;
        }

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
