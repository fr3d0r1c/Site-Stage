// Corbeille : un article supprimé n'est plus effacé tout de suite, il reçoit une date de suppression.
// Il disparaît du site, peut être restauré depuis l'admin, et est effacé définitivement après 30 jours.
module.exports = {
    up: (db) => {
        return new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(articles)", (err, columns) => {
                if (err) return reject(err);
                if (columns.some(c => c.name === 'deleted_at')) return resolve(); // déjà faite

                db.run("ALTER TABLE articles ADD COLUMN deleted_at DATETIME DEFAULT NULL", (errAlter) => {
                    if (errAlter) return reject(errAlter);
                    console.log("✅ Colonne 'deleted_at' ajoutée à 'articles' (corbeille).");
                    resolve();
                });
            });
        });
    }
};
