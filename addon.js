const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
require('dotenv').config(); // Carica le variabili d'ambiente dal file .env
const defineStreamHandlerForAddon = require('./streams');

// Leggi la chiave API TMDB dalla variabile d'ambiente
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const ITEMS_PER_PAGE = 20; // TMDB di solito restituisce 20 elementi per pagina

const manifest = {
    id: 'org.stremio.vixsrc.addon',
    version: '1.2.1',
    name: 'Vixsrc.to streams addon',
    description: 'Recupera flussi da VixSRC.to per film e serie TV.',
    resources: ['catalog', 'stream', 'meta'], // Aggiunto 'meta'
    types: ['movie', 'series'],
    catalogs: [      
        {
            type: 'series',
            id: 'tmdb_series_kdrama_it',
            name: 'K-Drama Popolari' // Nome e logica aggiornati
        }
    ]
};

const builder = new addonBuilder(manifest);
const tmdbEndpointMap = {
    series: {
        tmdb_series_kdrama_it: { // Oggetto per configurazione più complessa
            path: '/discover/tv',
            extraParams: { with_origin_country: 'KR', sort_by: 'popularity.desc' } // Riportato a paese d'origine Corea del Sud
        }
    }
};

builder.defineCatalogHandler(async ({ type, id, extra }) => {
    const skip = parseInt(extra.skip || 0);
    const currentPage = Math.floor(skip / ITEMS_PER_PAGE) + 1;

    console.log(`Richiesta per catalogo: ${type} ${id}, skip: ${skip}, page: ${currentPage}`);

    if (!TMDB_API_KEY) {
        console.error("ERRORE: La variabile d'ambiente TMDB_API_KEY non è impostata.");
        return Promise.reject(new Error("Chiave API TMDB non configurata. Impostare la variabile d'ambiente TMDB_API_KEY."));
    }
    let hasMore = false;
    let metas = [];
    const catalogConfig = tmdbEndpointMap[type] && tmdbEndpointMap[type][id];

    if (catalogConfig) {
        let tmdbPath;
        let specificParams = {};

        if (typeof catalogConfig === 'string') {
            tmdbPath = catalogConfig;
        } else if (typeof catalogConfig === 'object') {
            tmdbPath = catalogConfig.path;
            specificParams = catalogConfig.extraParams || {};
        }

        try {
            const response = await axios.get(`${TMDB_BASE_URL}${tmdbPath}`, {
                params: {
                    api_key: TMDB_API_KEY,
                    language: 'it-IT', // Imposta la lingua per i risultati
                    page: currentPage,
                    ...specificParams // Aggiunge parametri specifici per il catalogo
                }
            });

            const results = response.data.results || [];
            metas = results.map(item => {
                const meta = {
                    id: `tmdb:${item.id}`, // Usa l'ID TMDB come ID univoco per Stremio
                    type: type,
                    name: type === 'movie' ? item.title : item.name,
                    poster: item.poster_path ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}` : null,
                    description: item.overview,
                    releaseInfo: '',
                    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
                };
                if (type === 'movie' && item.release_date) {
                    meta.releaseInfo = item.release_date.substring(0, 4);
                } else if (type === 'series' && item.first_air_date) {
                    meta.releaseInfo = item.first_air_date.substring(0, 4);
                }
                return meta;
            });

            if (response.data.page && response.data.total_pages) {
                // Modifica per hasMore: basati sul numero di risultati ricevuti
                hasMore = metas.length === ITEMS_PER_PAGE;
                console.log(`Paginazione per ${type} ${id}: pagina corrente ${response.data.page}, pagine totali ${response.data.total_pages}, hasMore: ${hasMore}`);
            }

        } catch (error) {
            console.error('Errore nel recuperare dati da TMDB:', error.message);
            if (error.response) {
                console.error('Risposta errore TMDB:', error.response.status, error.response.data);
            }
            console.log(`Paginazione per ${type} ${id}: errore, 0 meta restituiti. hasMore: false`);
            return Promise.resolve({ metas: [], hasMore: false });
        }
    } else {
        console.warn(`Nessun endpoint TMDB trovato per type: ${type}, id: ${id}`);
        console.log(`Paginazione per ${type} ${id}: nessun endpoint, 0 meta restituiti. hasMore: false`);
    }
    // Rimosso il log duplicato di metas.length qui, poiché è già sopra o in caso di errore/no endpoint.
    return Promise.resolve({ metas, hasMore });
});

// Gestore per i metadati (dettagli di film/serie)
builder.defineMetaHandler(async ({ type, id }) => {
    console.log(`Richiesta meta per: type=${type}, id=${id}`);

    if (!TMDB_API_KEY) {
        console.error("ERRORE: La variabile d'ambiente TMDB_API_KEY non è impostata.");
        return Promise.reject(new Error("Chiave API TMDB non configurata."));
    }

    const idParts = id.split(':');
    if (idParts.length < 2 || idParts[0] !== 'tmdb') {
        console.warn(`ID meta non valido o non supportato: ${id}`);
        return Promise.resolve({ meta: null });
    }
    const tmdbId = idParts[1];

    let metaObject = null;

    try {
        if (type === 'movie') {
            const response = await axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}`, {
                params: { api_key: TMDB_API_KEY, language: 'it-IT' }
            });
            const movie = response.data;
            metaObject = {
                id: `tmdb:${movie.id}`,
                type: 'movie',
                name: movie.title,
                poster: movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : null,
                background: movie.backdrop_path ? `${TMDB_IMAGE_BASE_URL}${movie.backdrop_path}` : null,
                description: movie.overview,
                releaseInfo: movie.release_date ? movie.release_date.substring(0, 4) : '',
                imdbRating: movie.vote_average ? movie.vote_average.toFixed(1) : null,
                genres: movie.genres ? movie.genres.map(g => g.name) : [],
                // Aggiungi altre proprietà se necessario (cast, director, runtime, etc.)
            };
        } else if (type === 'series') {
            const seriesResponse = await axios.get(`${TMDB_BASE_URL}/tv/${tmdbId}`, {
                params: { api_key: TMDB_API_KEY, language: 'it-IT', append_to_response: 'external_ids' }
            });
            const series = seriesResponse.data;
            metaObject = {
                id: `tmdb:${series.id}`,
                type: 'series',
                name: series.name,
                poster: series.poster_path ? `${TMDB_IMAGE_BASE_URL}${series.poster_path}` : null,
                background: series.backdrop_path ? `${TMDB_IMAGE_BASE_URL}${series.backdrop_path}` : null,
                description: series.overview,
                releaseInfo: series.first_air_date ? series.first_air_date.substring(0, 4) : '',
                imdbRating: series.vote_average ? series.vote_average.toFixed(1) : null,
                genres: series.genres ? series.genres.map(g => g.name) : [],
                videos: [] // Qui verranno inseriti gli episodi
            };

            // Recupera stagioni ed episodi
            for (const season of series.seasons) {
                // Spesso la stagione 0 è "Specials", potresti volerla escludere o gestire diversamente
                if (season.season_number === 0 && season.episode_count === 0) continue; // Salta stagioni speciali vuote

                const seasonDetailsResponse = await axios.get(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${season.season_number}`, {
                    params: { api_key: TMDB_API_KEY, language: 'it-IT' }
                });
                const seasonDetails = seasonDetailsResponse.data;
                seasonDetails.episodes.forEach(episode => {
                    metaObject.videos.push({
                        id: `tmdb:${series.id}:${episode.season_number}:${episode.episode_number}`, // ID univoco per l'episodio
                        title: episode.name || `Episodio ${episode.episode_number}`,
                        season: episode.season_number,
                        episode: episode.episode_number,
                        released: episode.air_date || new Date().toISOString(), // Data di rilascio
                        overview: episode.overview,
                        thumbnail: episode.still_path ? `${TMDB_IMAGE_BASE_URL}${episode.still_path}` : null,
                    });
                });
            }
        }
    } catch (error) {
        console.error(`Errore nel recuperare metadati per ${type} ${id}:`, error.message);
        return Promise.resolve({ meta: null });
    }

    return Promise.resolve({ meta: metaObject });
});

defineStreamHandlerForAddon(builder);

const PORT = process.env.PORT || 5000; // Porta cambiata a 5000
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Addon in ascolto sulla porta ${PORT}`);
console.log(`Installa l'addon da: http://127.0.0.1:${PORT}/manifest.json`);