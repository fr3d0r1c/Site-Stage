module.exports = {
    up: (db) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // On ajoute les colonnes Latitude et Longitude
                db.run("ALTER TABLE articles ADD COLUMN lat REAL", (err) => {
                    if (err && !err.message.includes('duplicate column')) console.log("Info: lat existe peut-être déjà");
                });
                db.run("ALTER TABLE articles ADD COLUMN lng REAL", (err) => {
                    if (err && !err.message.includes('duplicate column')) console.log("Info: lng existe peut-être déjà");
                    resolve();
                });
            });
        });
    }
};