const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
require('dotenv').config(); // Carica le variabili d'ambiente dal file .env
const defineStreamHandlerForAddon = require('./streams');

// Leggi la chiave API TMDB dalla variabile d'ambiente
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const ITEMS_PER_PAGE = 20; // TMDB di solito restituisce 20 elementi per pagina (usato per calcolare la pagina TMDB da richiedere)
const CATALOG_CACHE_MAX_AGE = 3600; // Cache per 1 ora (in secondi) - Potrebbe essere ridotto se i dati cambiano spesso
const CATALOG_STALE_REVALIDATE = 60 * 5; // Riconvalida in background dopo 5 minuti (in secondi)
const CATALOG_STALE_ERROR = 60 * 60 * 24; // Usa dati vecchi fino a 24 ore in caso di errore (in secondi)


const manifest = {
    id: 'org.stremio.vixsrc.addon',
    version: '1.2.4',
    name: 'Vixsrc.to streams addon',
    description: 'Recupera flussi da VixSrc per film e serie TV',
    logo: 'https://icon-library.com/images/letter-v-icon/letter-v-icon-8.jpg',
    resources: ['catalog', 'stream', 'meta'], // Aggiunto 'meta'
    types: ['movie', 'series'],
    catalogs: [      
        {
            type: 'series',
            id: 'tmdb_series_kdrama_it',
            name: 'K-Drama Popolari', // Nome e logica aggiornati
            extra: [ // Dichiarare i parametri extra supportati
                { name: 'skip', isRequired: false }, // Usato da Stremio per la paginazione
                { name: 'search', isRequired: false } // Aggiunto per la ricerca
            ],
            // Aggiungi qui eventuali filtri specifici per questo catalogo se necessario in futuro
            filter: {} // Struttura vuota per ora, ma utile per il futuro
        }
    ]
};

const builder = new addonBuilder(manifest);
const tmdbEndpointMap = {
    series: {
        tmdb_series_kdrama_it: { // Oggetto per configurazione più complessa
            path: '/discover/tv',
            // Aggiungi qui i parametri API specifici per questo catalogo
            extraParams: {
                with_origin_country: 'KR',
                 sort_by: 'first_air_date.desc', // Ordinamento per data di uscita decrescente
                 'vote_average.gte': 0,        // Rating minimo 3
                 'vote_average.lte': 10,       // Rating massimo 10
                // 'vote_count.lte': 1000,        // Numero minimo di voti
                'with_genres': 18,            // Filtro per genere: Drama (ID 18)
                'with_runtime.gte': 20       // Durata minima episodi in minuti (commentato per test)
            }
        }
    }
};

builder.defineCatalogHandler(async ({ type, id, extra }) => {
    const skip = parseInt(extra.skip || 0);
    const currentPage = Math.floor(skip / ITEMS_PER_PAGE) + 1;
    const searchQuery = extra.search; // Recupera la query di ricerca

    console.log(`Richiesta per catalogo: ${type} ${id}, skip: ${skip}, page: ${currentPage}, search: "${searchQuery || 'N/A'}"`);

    if (!TMDB_API_KEY) {
        console.error("ERRORE: La variabile d'ambiente TMDB_API_KEY non è impostata.");
        return Promise.reject(new Error("Chiave API TMDB non configurata. Impostare la variabile d'ambiente TMDB_API_KEY."));
    }

    let hasMore = false;
    let metas = [];
    let tmdbPath;
    let apiParams = { // Parametri di base per TMDB
        api_key: TMDB_API_KEY,
        language: 'it-IT',
        page: currentPage
    };

    if (searchQuery) {
        // Se c'è una query di ricerca, usiamo l'endpoint di ricerca di TMDB
        if (type === 'series') {
            tmdbPath = '/search/tv';
            apiParams.query = searchQuery;
            // Opzionale: se vuoi che la ricerca sia limitata ai K-Drama anche quando si cerca
            // apiParams.with_origin_country = 'KR'; 
        } else {
            // Attualmente hai solo cataloghi di serie, ma per completezza
            console.warn(`La ricerca per il tipo '${type}' non è attualmente supportata con una query di ricerca.`);
            return Promise.resolve({ metas: [], hasMore: false, cacheMaxAge: CATALOG_CACHE_MAX_AGE, staleRevalidate: CATALOG_STALE_REVALIDATE, staleError: CATALOG_STALE_ERROR });
        }
    } else {
        // Logica del catalogo esistente (senza ricerca)
        const catalogConfig = tmdbEndpointMap[type] && tmdbEndpointMap[type][id];
        if (catalogConfig) {
            tmdbPath = catalogConfig.path;
            apiParams = { ...apiParams, ...(catalogConfig.extraParams || {}) };
        }
    }

    if (tmdbPath) {
        try {
            const response = await axios.get(`${TMDB_BASE_URL}${tmdbPath}`, {
                params: apiParams
            });

            const results = response.data.results || [];

            // Applica i filtri ai risultati prima di mapparli in metadati Stremio
            const filteredResults = results.filter(item => {
                // Filtro 1: Escludi serie senza descrizione in italiano
                // TMDB con language=it-IT dovrebbe già fornire descrizioni in italiano se disponibili.
                // Questo filtro rimuove quelle che, anche con la lingua impostata, non hanno una descrizione.
                if (type === 'series' && (!item.overview || item.overview.trim() === '')) {
                    // console.log(`Esclusa serie ${item.name} (ID: ${item.id}) per mancanza descrizione.`);
                    return false;
                }

                // Filtro 2: Escludi serie che devono ancora uscire (solo per serie)
                if (type === 'series' && item.first_air_date) {
                    try {
                        const firstAirDate = new Date(item.first_air_date);
                        const now = new Date();
                        // Confronta solo la data, ignora l'ora
                        const firstAirDateOnly = new Date(firstAirDate.getFullYear(), firstAirDate.getMonth(), firstAirDate.getDate());
                        const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                        if (firstAirDateOnly > nowOnly) {
                            // console.log(`Esclusa serie ${item.name} (ID: ${item.id}) perché deve ancora uscire (${item.first_air_date}).`);
                            return false;
                        }
                    } catch (e) {
                        console.warn(`Errore nel parsing della data ${item.first_air_date} per la serie ${item.name}: ${e.message}`);
                        // Se la data non è valida, meglio includerla per sicurezza piuttosto che escluderla per errore
                    }
                }
                return true; // Mantieni l'elemento se passa tutti i filtri
            });
            metas = filteredResults.map(item => {
                const meta = {
                    id: `tmdb:${item.id}`, // Usa l'ID TMDB come ID univoco per Stremio
                    type: type,
                    name: type === 'movie' ? item.title : item.name,
                    poster: item.poster_path ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}` : null,
                    description: item.overview,
                    releaseInfo: '',
                    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null, // TMDB vote_average non è IMDb rating, ma lo usiamo qui per semplicità
                };
                if (type === 'movie' && item.release_date) {
                    meta.releaseInfo = item.release_date.substring(0, 4);
                } else if (type === 'series' && item.first_air_date) {
                    meta.releaseInfo = item.first_air_date.substring(0, 4);
                }
                // Aggiungi l'anno di fine se la serie è terminata (opzionale)
                if (type === 'series' && item.last_air_date && !item.in_production) {
                     meta.releaseInfo += ` - ${new Date(item.last_air_date).getFullYear()}`;
                }
                return meta;
            });
            if (response.data.page && response.data.total_pages) {
                // Modifica per hasMore: basati sul numero di risultati ricevuti
                // Logica migliorata: hasMore è true se ci sono ancora pagine su TMDB
                hasMore = response.data.page < response.data.total_pages;
                console.log(`Paginazione TMDB: pagina ${response.data.page}/${response.data.total_pages}. Risultati filtrati in questa pagina: ${metas.length}. hasMore impostato a: ${hasMore}`);
            }

        } catch (error) {
            console.error('Errore nel recuperare dati da TMDB:', error.message);
            if (error.response) {
                console.error('Risposta errore TMDB:', error.response.status, error.response.data);
            }
            console.log(`Paginazione per ${type} ${id}: errore, 0 meta restituiti. hasMore: false`);
            return Promise.resolve({
                metas: [],
                hasMore: false,
                cacheMaxAge: CATALOG_CACHE_MAX_AGE,
                staleRevalidate: CATALOG_STALE_REVALIDATE,
                staleError: CATALOG_STALE_ERROR
            });
        }
    } else {
        console.warn(`Nessun percorso TMDB definito per la richiesta: type=${type}, id=${id}, search="${searchQuery || 'N/A'}"`);
        console.log(`Paginazione per ${type} ${id}: nessun endpoint, 0 meta restituiti. hasMore: false`);
        return Promise.resolve({
            metas: [],
            hasMore: false,
            cacheMaxAge: CATALOG_CACHE_MAX_AGE,
            staleRevalidate: CATALOG_STALE_REVALIDATE,
            staleError: CATALOG_STALE_ERROR
        });
    }
    return Promise.resolve({ metas, hasMore, cacheMaxAge: CATALOG_CACHE_MAX_AGE, staleRevalidate: CATALOG_STALE_REVALIDATE, staleError: CATALOG_STALE_ERROR });
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
