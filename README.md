# Addon Stremio Vixsrc.to

Questo addon per Stremio fornisce cataloghi da TMDB e recupera flussi video da VixSRC.to tramite un'istanza di [MediaFlow Proxy](https://github.com/DwayneRock/MediaFusion-MediaFlow-Proxy) (o un proxy compatibile).

## Prerequisiti

*   **Node.js**: Versione 18.x o superiore (per l'esecuzione locale).
*   **Docker**: (Opzionale, per l'esecuzione con Docker o il deployment su piattaforme come Render).
*   **Docker Compose**: (Opzionale, per un'orchestrazione più semplice con Docker).
*   **Chiave API TMDB**: Ottenibile gratuitamente da [The Movie Database (TMDB)](https://www.themoviedb.org/settings/api).
*   **URL del MediaFlow Proxy**: L'indirizzo del tuo proxy (es. `https://tuo-proxy.esempio.com`).
*   **Password API del MediaFlow Proxy**: La password configurata per il tuo proxy.

## Variabili d'Ambiente Richieste

L'addon richiede che le seguenti variabili d'ambiente siano impostate per funzionare correttamente:

*   `TMDB_API_KEY`: La tua chiave API di TMDB.
*   `MEDIAFLOW_PROXY_URL`: L'URL completo della tua istanza di MediaFlow Proxy (senza slash finale, es. `https://proxy.esempio.com`).
*   `API_PASSWORD`: La password API per il tuo MediaFlow Proxy.
*   `PORT`: (Opzionale) La porta su cui l'addon sarà in ascolto. Default: `5000`. L'applicazione Node.js leggerà questa variabile. Per Docker Compose, questa variabile (se impostata nell'ambiente shell) definirà anche la porta host.

## Esecuzione Locale (Sviluppo)

1.  **Clona il repository (se applicabile):**
    ```bash
    git clone <url-del-tuo-repository>
    cd <nome-cartella-repository>
    ```

2.  **Crea un file `.env`**:
    Nella root del progetto, crea un file chiamato `.env` e inserisci le tue variabili d'ambiente. Questo file verrà utilizzato da `npm start` grazie a `dotenv`.
    ```env
    TMDB_API_KEY="LA_TUA_CHIAVE_TMDB"
    MEDIAFLOW_PROXY_URL="https://IL_TUO_PROXY_URL" # Senza slash finale
    API_PASSWORD="LA_TUA_PASSWORD_PROXY"
    # PORT=5000 # Opzionale, se vuoi usare una porta diversa dalla 5000
    ```

3.  **Installa le dipendenze:**
    ```bash
    npm install
    ```

4.  **Avvia l'addon:**
    ```bash
    npm start
    ```
    L'addon sarà in ascolto sulla porta `5000` (o quella specificata in `PORT` nel file `.env`).

5.  **Installa in Stremio:**
    Apri Stremio, vai alla sezione Addons e installa l'addon usando l'URL: `http://127.0.0.1:5000/manifest.json` (sostituisci `5000` se hai usato una porta diversa).

## Esecuzione con Docker

### Opzione 1: Esecuzione manuale del container Docker (utilizzando il file `.env`)

1.  **Crea il file `.env`** come descritto nella sezione "Esecuzione Locale".
2.  **Builda l'immagine Docker:**
    ```bash
    docker build -t vixsrc-stremio-addon .
    ```
3.  **Esegui il container Docker:**
    ```bash
    docker run -d -p 5000:5000 --env-file .env --name vixsrc-addon vixsrc-stremio-addon
    ```
    Questo comando esegue il container in background (`-d`), mappa la porta `5000` del container alla porta `5000` del tuo host, carica le variabili d'ambiente dal file `.env`, e assegna un nome al container.
4.  **Installa in Stremio:**
    Usa l'URL `http://localhost:5000/manifest.json` (o l'IP della tua macchina Docker se non è `localhost`).

### Opzione 2: Esecuzione con Docker Compose (utilizzando variabili d'ambiente della shell)

Questo metodo richiede che le variabili d'ambiente siano impostate nella tua shell *prima* di eseguire `docker-compose`. Il file `docker-compose.yml` è configurato per prelevarle da lì.

1.  **Imposta le variabili d'ambiente nella tua shell:**
    *   Su Linux/macOS:
        ```bash
        export TMDB_API_KEY="LA_TUA_CHIAVE_TMDB"
        export MEDIAFLOW_PROXY_URL="https://IL_TUO_PROXY_URL" # Senza slash finale
        export API_PASSWORD="LA_TUA_PASSWORD_PROXY"
        # export PORT=5001 # Opzionale, per cambiare la porta host
        ```
    *   Su Windows (PowerShell):
        ```powershell
        $env:TMDB_API_KEY="LA_TUA_CHIAVE_TMDB"
        $env:MEDIAFLOW_PROXY_URL="https://IL_TUO_PROXY_URL" # Senza slash finale
        $env:API_PASSWORD="LA_TUA_PASSWORD_PROXY"
        # $env:PORT=5001 # Opzionale
        ```
    *   Su Windows (CMD):
        ```cmd
        set TMDB_API_KEY=LA_TUA_CHIAVE_TMDB
        set MEDIAFLOW_PROXY_URL=https://IL_TUO_PROXY_URL # Senza slash finale
        set API_PASSWORD=LA_TUA_PASSWORD_PROXY
        REM set PORT=5001 # Opzionale
        ```
2.  **Avvia i servizi con Docker Compose:**
    ```bash
    docker-compose up -d
    ```
    Se è la prima volta o se il `Dockerfile` è cambiato, builda l'immagine:
    ```bash
    docker-compose up -d --build
    ```
3.  **Per fermare i servizi:**
    ```bash
    docker-compose down
    ```
4.  **Installa in Stremio:**
    Usa l'URL `http://localhost:5000/manifest.json`. Se hai impostato la variabile `PORT` nella tua shell a un valore diverso da `5000`, usa quella porta nell'URL per l'host.

## Deployment su Render.com (o piattaforme simili)

Render.com può deployare applicazioni Docker.

1.  **Pusha il tuo codice su un repository Git** (es. GitHub, GitLab). Assicurati che il `Dockerfile` sia presente.
2.  **Crea un nuovo "Web Service" su Render:**
    *   Collega il tuo account Render al tuo provider Git e seleziona il repository.
    *   **Environment**: Seleziona "Docker".
3.  **Configura il servizio:**
    *   **Build Command**: Render dovrebbe gestirlo automaticamente usando il `Dockerfile`.
    *   **Start Command**: Render dovrebbe gestirlo automaticamente usando il `CMD` nel `Dockerfile`.
    *   **Variabili d'Ambiente**: Nella sezione "Environment" del tuo servizio su Render, aggiungi le seguenti variabili (Render imposterà automaticamente la variabile `PORT` interna per l'applicazione):
        *   `TMDB_API_KEY`
        *   `MEDIAFLOW_PROXY_URL` (senza slash finale)
        *   `API_PASSWORD`
4.  **Deploya:** Avvia il deploy.
5.  **Installa in Stremio:**
    Una volta che il servizio è deployato, Render ti fornirà un URL pubblico (es. `https://tuo-addon.onrender.com`). Usa questo URL per installare l'addon in Stremio:
    `https://tuo-addon.onrender.com/manifest.json`

---

**Importante**: Assicurati che la tua istanza di MediaFlow Proxy (`MEDIAFLOW_PROXY_URL`) sia accessibile pubblicamente se vuoi che l'addon funzioni correttamente quando deployato su piattaforme cloud come Render.