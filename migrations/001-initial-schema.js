// migrations/001-initial-schema.js
module.exports = {
    up: (db) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // 1. Users (Admin)
                db.run(`CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    email TEXT UNIQUE,
                    avatar_url TEXT,
                    reset_token TEXT,
                    reset_token_expires INTEGER,
                    two_fa_secret TEXT,
                    two_fa_enabled INTEGER DEFAULT 0,
                    two_fa_prompted INTEGER DEFAULT 0
                )`);

                // 2. Articles
                db.run(`CREATE TABLE IF NOT EXISTS articles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
                    summary_fr TEXT, summary_en TEXT,
                    content_fr TEXT NOT NULL, content_en TEXT NOT NULL,
                    cover_image_url TEXT,
                    likes INTEGER DEFAULT 0,
                    views INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'published',
                    publication_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    user_id INTEGER,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
                )`);

                // 3. Tags
                db.run(`CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name_fr TEXT UNIQUE NOT NULL,
                    name_en TEXT UNIQUE NOT NULL
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS article_tags (
                    article_id INTEGER,
                    tag_id INTEGER,
                    PRIMARY KEY (article_id, tag_id),
                    FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
                )`);

                // 4. Invités (Guests)
                db.run(`CREATE TABLE IF NOT EXISTS guests (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT,
                    avatar_style TEXT DEFAULT 'bottts',
                    comment_count INTEGER DEFAULT 0,
                    like_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                // 5. Commentaires
                db.run(`CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    article_id INTEGER NOT NULL,
                    parent_id INTEGER DEFAULT NULL,
                    guest_id TEXT,
                    author_name TEXT NOT NULL,
                    author_email TEXT,
                    author_avatar TEXT,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_approved INTEGER DEFAULT 1,
                    is_admin INTEGER DEFAULT 0,
                    delete_token TEXT,
                    FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE,
                    FOREIGN KEY (parent_id) REFERENCES comments (id) ON DELETE CASCADE,
                    FOREIGN KEY (guest_id) REFERENCES guests (id) ON DELETE SET NULL
                )`);

                // 6. Likes
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

                // 7. Logs & Newsletter
                db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER, username TEXT, action TEXT NOT NULL, details TEXT, ip_address TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS subscribers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS contact_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT, email TEXT, subject TEXT, message TEXT, is_read INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }
};