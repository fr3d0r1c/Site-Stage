module.exports = {
    up: (db) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                
                // Fonction utilitaire pour ajouter une colonne sans planter si elle existe déjà
                const addColumn = (table, col, type) => {
                    db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`, (err) => {
                        // On ignore l'erreur "duplicate column name" (code SQLITE_ERROR souvent)
                        if (err && !err.message.includes('duplicate column')) {
                            console.warn(`Note: Colonne ${col} dans ${table} non ajoutée (existe peut-être déjà).`);
                        } else if (!err) {
                            console.log(`✅ Colonne '${col}' ajoutée à '${table}'.`);
                        }
                    });
                };

                // --- 1. MISE À JOUR TABLE ARTICLES ---
                console.log("🔄 Mise à jour de la table Articles...");
                addColumn('articles', 'status', "TEXT DEFAULT 'published'"); // Brouillons
                addColumn('articles', 'views', "INTEGER DEFAULT 0");         // Compteur Vues
                addColumn('articles', 'is_pinned', "INTEGER DEFAULT 0");     // Épinglage
                addColumn('articles', 'lat', "REAL");                        // Latitude (Carte)
                addColumn('articles', 'lng', "REAL");                        // Longitude (Carte)

                // --- 2. MISE À JOUR TABLE COMMENTS ---
                console.log("🔄 Mise à jour de la table Comments...");
                addColumn('comments', 'guest_id', "TEXT REFERENCES guests(id) ON DELETE SET NULL");

                // --- 3. CRÉATION DES NOUVELLES TABLES ---
                
                // Table INVITES (Gamification & Profil)
                db.run(`CREATE TABLE IF NOT EXISTS guests (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT,
                    avatar_style TEXT DEFAULT 'bottts',
                    comment_count INTEGER DEFAULT 0,
                    like_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                // Table LIKES (Système Toggle)
                db.run(`CREATE TABLE IF NOT EXISTS article_likes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    article_id INTEGER NOT NULL,
                    user_id INTEGER,
                    guest_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                    FOREIGN KEY (guest_id) REFERENCES guests (id) ON DELETE CASCADE,
                    UNIQUE(article_id, user_id),
                    UNIQUE(article_id, guest_id)
                )`);

                // Tables COMMUNAUTÉ (Contact & Newsletter)
                db.run(`CREATE TABLE IF NOT EXISTS contact_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT, email TEXT, subject TEXT, message TEXT,
                    is_read INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS subscribers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                // Table CONFIGURATION (Pour la musique)
                db.run(`CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )`, (err) => {
                    if (!err) {
                        // Données par défaut pour la musique
                        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('music_title', 'Ambiance Chill')");
                        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('music_url', '/music/chill-beat.mp3')");
                    }
                    // C'est la dernière commande, on résout la promesse ici
                    resolve();
                });
            });
        });
    }
};