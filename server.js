// On importe l'objet 'app' (mais pas 'db') depuis notre fichier app.js
const { app } = require('./app');

// On redéfinit le port ici
const port = process.env.PORT || 3000;

// On démarre le serveur
app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
});