# 1. Image de base légère
FROM node:20-alpine

# 2. Répertoire de travail
WORKDIR /app

# 3. INSTALLATION DES OUTILS DE COMPILATION (Indispensable pour SQLite sur Alpine)
RUN apk add --no-cache python3 make g++

# 4. Copie des fichiers de config
COPY package*.json ./

# 5. Installation des dépendances
RUN npm install --production --ignore-scripts

# 6. RECONSTRUCTION FORCÉE DE SQLITE
RUN npm rebuild sqlite3

# 7. Copie du reste du code (en ignorant node_modules grâce au .dockerignore)
COPY . .

# 8. Configuration
ENV NODE_ENV=production
ENV PORT=3000

# 9. Ouverture du port
EXPOSE 3000

# 10. Démarrage
CMD ["node", "server.js"]