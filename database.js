const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Connexion à la BDD
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'blog.db';

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ Erreur connexion BDD:", err.message);
    } else {
        console.log(`✅ Connecté à la base de données SQLite (${dbPath}).`);

        db.run("PRAGMA foreign_keys = ON", (err) => {
            if (err) console.error("Erreur activation Foreign Keys:", err);
            else console.log("🔑 Clés étrangères activées (Cascade Delete actif).");
        });
    }
});

// --- SYSTÈME DE MIGRATION ---
async function migrate() {
    return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, async (err) => {
            if (err) return reject(err);

            const migrationFiles = fs.readdirSync(path.join(__dirname, 'migrations')).sort();

            for (const file of migrationFiles) {
                const alreadyApplied = await new Promise(res => {
                    db.get('SELECT id FROM migrations WHERE name = ?', [file], (e, row) => res(!!row));
                });

                if (!alreadyApplied) {
                    console.log(`🔄 Application de la migration : ${file}...`);
                    const migration = require(`./migrations/${file}`);
                    try {
                        await migration.up(db);
                        db.run('INSERT INTO migrations (name) VALUES (?)', [file]);
                        console.log(`✅ Migration ${file} terminée.`);
                    } catch (migErr) {
                        console.error(`❌ Erreur migration ${file}:`, migErr);
                        return reject(migErr);
                    }
                }
            }
            resolve();
        });
    });
}

migrate().catch(err => console.error("FATAL : Erreur migration", err));

module.exports = db;