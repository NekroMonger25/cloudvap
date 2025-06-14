# Usa un'immagine Node.js LTS come base
FROM node:18-alpine

# Imposta la directory di lavoro all'interno del container
WORKDIR /usr/src/app

# Copia package.json e package-lock.json (se esiste)
# Questo sfrutta il caching dei layer di Docker
COPY package*.json ./

# Installa le dipendenze di produzione
RUN npm ci --omit=dev

# Copia il resto dei file dell'applicazione
COPY . .

# Esponi la porta su cui l'addon sarà in ascolto
# L'addon usa la variabile d'ambiente PORT o 5000 di default
EXPOSE 5000

# Comando per avviare l'applicazione
CMD [ "npm", "start" ]