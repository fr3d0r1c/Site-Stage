module.exports = {
    up: (db) => {
        return new Promise((resolve, reject) => {
            db.run("ALTER TABLE articles ADD COLUMN is_pinned INTEGER DEFAULT 0", (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.error("Erreur migration pinned:", err);
                    reject(err);
                } else {
                    console.log("Migration: Colonne 'is_pinned' ajoutée.");
                    resolve();
                }
            });
        });
    }
};