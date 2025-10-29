// =================================================================
// 1. IMPORTS (DÉPENDANCES)
// =================================================================
require('dotenv').config(); // Pour lire le .env (identifiants email, etc.)
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { marked } = require('marked'); // Pour convertir le Markdown
const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const FsBackend = require('i18next-fs-backend');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // Pour le token de reset password
const path = require('path'); // Pour le chemin des vues
const deepl = require('deepl-node');

// =================================================================
// 2. INITIALISATION ET CONFIGURATION D'EXPRESS
// =================================================================

// === Initialisation de DeepL ===
const deeplApiKey = process.env.DEEPL_API_KEY;
let translator = null;
if (!deeplApiKey) {
    // Affiche un avertissement si la clé manque
    console.warn("AVERTISSEMENT : Clé API DeepL manquante dans .env. La traduction automatique sera désactivée.");
} else {
    try {
        // Crée l'objet translator uniquement si la clé existe
        translator = new deepl.Translator(deeplApiKey);
        console.log("Client Deepl initialisé.");
    } catch (error) {
        // Affiche une erreur si l'initialisation échoue (ex: clé invalide au format)
        console.error("Erreur lors de l'initialisation du client DeepL:", error);
        // translator reste null dans ce cas
    }
}

const app = express();
const port = process.env.PORT || 3000;
const ITEMS_PER_PAGE = 5; // Pour la pagination

// Définir EJS comme moteur de template
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Chemin vers le dossier views

// Configuration du stockage pour Multer (upload d'images)
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- CONFIGURATION i18n (TRADUCTION INTERFACE + DÉTECTION) ---
i18next
.use(FsBackend) // Charge les traductions depuis les fichiers (locales/...)
.use(i18nextMiddleware.LanguageDetector) // Détecte la langue
.init({
    backend: {
        loadPath: __dirname + '/locales/{{lng}}/translation.json', // Chemin vers tes fichiers JSON
        },
        fallbackLng: 'fr',
        preload: ['fr', 'en'],
        detection: {
            order: ['querystring', 'cookie', 'header'], // Ordre de détection
            caches: ['cookie'],
            cookieOptions: {
                path: '/',
                maxAge: 30 * 24 * 60 * 60 * 1000
            }
        }
    });

// --- NODEMAILER CONFIGURATION ---
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail', // Ou autre service si configuré
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS, // Mot de passe d'application pour Gmail
        },
    });
    console.log("Nodemailer configuré.");
} else {
    console.warn("AVERTISSEMENT : Identifiants email manquants dans .env. Le formulaire de contact et le reset password seront désactivés.");
}


// =================================================================
// 3. MIDDLEWARES
// =================================================================
// Servir les fichiers statiques (CSS, JS, images uploadées)
app.use(express.static('public'));

// Middleware pour lire les données de formulaire
app.use(express.urlencoded({ extended: true }));

// Middleware pour lire le JSON (utile pour l'API d'upload)
app.use(express.json());

// Configuration du middleware de session
app.use(session({
  secret: 'votre-secret-personnel-tres-difficile-a-deviner', // Change this!
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true } // Set secure:true in production with HTTPS
}));

// Middleware pour i18next (après session)
app.use(i18nextMiddleware.handle(i18next));

// Rendre les données de session disponibles dans toutes les vues
app.use((req, res, next) => {
    res.locals.username = req.session.username;
    next();
});

// Middleware "garde" pour vérifier si l'utilisateur est authentifié
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    // Pour les requêtes API (comme /upload-image), renvoie JSON
    if (req.originalUrl.startsWith('/upload-image') || req.originalUrl.startsWith('/api/')) { // Check API routes
       return res.status(401).json({ error: 'Accès non autorisé. Veuillez vous reconnecter.' });
    }
    // Pour les pages normales, redirige
    res.redirect('/connexion');
}

// Middleware pour vérifier si un compte admin existe déjà
function checkAdminExists(req, res, next) {
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) {
            console.error("Erreur BDD (checkAdminExists):", err);
            return res.status(500).send("Erreur serveur lors de la vérification admin.");
        }
        if (row.count === 0) {
            next(); // Autorise l'accès à l'inscription si aucun utilisateur n'existe
        } else {
            res.redirect('/connexion'); // Redirige si un admin existe déjà
        }
    });
}

// =================================================================
// 4. CONNEXION À LA BASE DE DONNÉES ET CRÉATION DES TABLES
// =================================================================
const db = new sqlite3.Database('./blog.db', (err) => {
  if (err) {
    // Log fatal error and exit if DB connection fails
    console.error("Erreur fatale: Impossible de se connecter à la base de données SQLite.", err);
    process.exit(1);
  }
  console.log('Connecté à la base de données SQLite.');
});

// Création de la table 'articles' (version bilingue + cover)
const createArticleTable = `
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
  content_fr TEXT NOT NULL, content_en TEXT NOT NULL,
  cover_image_url TEXT,
  publication_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL -- Garde l'article si user supprimé
);
`;
db.run(createArticleTable, (err) => {
    if (err) console.error("Erreur création table articles:", err);
});

// Création de la table 'users' (avec email et reset token)
const createUserTable = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  email TEXT UNIQUE,
  reset_token TEXT,
  reset_token_expires INTEGER
);
`;
db.run(createUserTable, (err) => {
     if (err) console.error("Erreur création table users:", err);
});

// Création de la table 'tags' (bilingue)
const createTagsTable = `
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_fr TEXT UNIQUE NOT NULL,
  name_en TEXT UNIQUE NOT NULL
);
`;
db.run(createTagsTable, (err) => {
     if (err) console.error("Erreur création table tags:", err);
});

// Création de la table de liaison 'article_tags'
const createArticleTagsTable = `
CREATE TABLE IF NOT EXISTS article_tags (
  article_id INTEGER, tag_id INTEGER,
  FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);
`;
db.run(createArticleTagsTable, (err) => {
    if (err) console.error("Erreur création table article_tags:", err);
});


// =================================================================
// 5. FONCTION HELPER POUR LES TAGS
// =================================================================
async function processTags(articleId, tagNames) {
    // Use Promises for better async control with db calls
    const getTagId = (name) => new Promise((resolve, reject) => {
        db.get('SELECT id FROM tags WHERE name_fr = ?', [name], (err, row) => err ? reject(err) : resolve(row));
    });

    const createTag = (name) => new Promise((resolve, reject) => {
        db.run('INSERT INTO tags (name_fr, name_en) VALUES (?, ?)', [name, name], function(err) {
             if (err && err.message.includes('UNIQUE constraint failed')) {
                 db.get('SELECT id FROM tags WHERE name_en = ?', [name], (errFind, rowFind) => { // Try finding by EN name
                     if (errFind || !rowFind) { reject(err); } else { resolve(rowFind); }
                 });
             } else if (err) { reject(err); }
             else { resolve({ id: this.lastID }); }
        });
    });

    const deleteLinks = (artId) => new Promise((resolve, reject) => {
        db.run('DELETE FROM article_tags WHERE article_id = ?', [artId], (err) => err ? reject(err) : resolve());
    });

    const insertLinks = (artId, ids) => new Promise((resolve, reject) => {
        if (ids.length === 0) return resolve();
        const placeholders = ids.map(() => '(?, ?)').join(',');
        const values = ids.reduce((acc, tagId) => acc.concat([artId, tagId]), []);
        const sql = `INSERT INTO article_tags (article_id, tag_id) VALUES ${placeholders}`;
        db.run(sql, values, (err) => err ? reject(err) : resolve());
    });

    try {
        const tagIds = [];
        for (const name of tagNames) {
            let tag = await getTagId(name);
            if (!tag) {
                tag = await createTag(name);
            }
            if (tag) { tagIds.push(tag.id); }
            else { console.warn(`Could not find or create tag for name: ${name}`); }
        }
        await deleteLinks(articleId);
        await insertLinks(articleId, tagIds);
    } catch (error) {
         console.error("Error in processTags:", error);
         throw error; // Re-throw error to be caught by the route
    }
}


// =================================================================
// 6. ROUTES
// =================================================================

// --- PAGES PUBLIQUES (LECTURE) ---

// Page d'accueil
app.get('/', (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sql = `SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name_${lang}) as tags FROM articles a LEFT JOIN article_tags at ON a.id = at.article_id LEFT JOIN tags t ON at.tag_id = t.id GROUP BY a.id ORDER BY a.publication_date DESC LIMIT 3`;
    db.all(sql, [], (err, rows) => {
        if (err) { console.error("Erreur BDD (GET /):", err); return res.status(500).send("Erreur serveur."); }
        const articlesWithData = rows.map(article => {
            const tagList = article.tags ? article.tags.split(',') : [];
            let finalCoverImage = null;
            if (article.cover_image_url) { finalCoverImage = article.cover_image_url; } else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
            const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
            return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
        });
        res.render('index', { articles: articlesWithData, pageTitle: req.t('page_titles.home'), activePage: 'accueil' });
    });
});

// Pages statiques
app.get('/profil', (req, res) => { res.render('profil', { pageTitle: req.t('page_titles.profile'), activePage: 'profil' }); });
app.get('/stage', (req, res) => { res.render('stage', { pageTitle: req.t('page_titles.internship'), activePage: 'stage' }); });
app.get('/contact', (req, res) => { res.render('contact', { pageTitle: req.t('page_titles.contact'), activePage: 'contact', messageSent: null }); });
app.get('/admin', isAuthenticated, (req, res) => { res.render('admin', { pageTitle: req.t('admin_page.title'), activePage: 'admin' }); });

// Page de tout le journal (avec pagination)
app.get('/journal', (req, res) => {
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sqlEntries = `SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name_${lang}) as tags FROM articles a LEFT JOIN article_tags at ON a.id = at.article_id LEFT JOIN tags t ON at.tag_id = t.id GROUP BY a.id ORDER BY a.publication_date DESC LIMIT ? OFFSET ?`;
    const sqlCount = `SELECT COUNT(*) as totalCount FROM articles`;
    db.all(sqlEntries, [ITEMS_PER_PAGE, offset], (err, rows) => {
        if (err) { console.error("Erreur BDD (GET /journal entries):", err); return res.status(500).send("Erreur serveur."); }
        db.get(sqlCount, [], (errCount, countResult) => {
            if (errCount) { console.error("Erreur BDD (GET /journal count):", errCount); return res.status(500).send("Erreur serveur."); }
            const totalEntries = countResult.totalCount;
            const totalPages = Math.ceil(totalEntries / ITEMS_PER_PAGE);
            const articlesWithData = rows.map(article => {
                const tagList = article.tags ? article.tags.split(',') : [];
                let finalCoverImage = null;
                if (article.cover_image_url) { finalCoverImage = article.cover_image_url; } else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
                const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
                return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
            });
            res.render('journal', { articles: articlesWithData, pageTitle: req.t('page_titles.journal'), activePage: 'journal', currentPage: currentPage, totalPages: totalPages, currentTag: null });
        });
    });
});

// Page de détail d'une entrée
app.get('/entree/:id', (req, res) => {
    const id = req.params.id;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sqlArticle = `SELECT id, title_${lang} as title, content_${lang} as content, cover_image_url, publication_date FROM articles WHERE id = ?`;
    const sqlTags = `SELECT t.name_${lang} as name FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?`;
    db.get(sqlArticle, id, (err, article) => {
        if (err) { console.error(`Erreur BDD (GET /entree/${id} article):`, err); return res.status(500).send("Erreur serveur."); }
        if (!article) { return res.status(404).send("Entrée non trouvée !"); }
        db.all(sqlTags, id, (errTags, tagRows) => {
            if (errTags) { console.error(`Erreur BDD (GET /entree/${id} tags):`, errTags); return res.status(500).send("Erreur serveur."); }
            article.tags = tagRows.map(tag => tag.name);
            let finalContent = article.content;
            const markdownTitle = '# ' + article.title;
            if (finalContent.trim().startsWith(markdownTitle)) { finalContent = finalContent.substring(markdownTitle.length).trim(); }
            article.content = marked.parse(finalContent);
            res.render('entry_detail', { article: article, pageTitle: article.title, activePage: 'journal' });
        });
    });
});

// --- RECHERCHE ---
app.get('/search', (req, res) => {
    const query = req.query.query;
    const lang = req.language === 'en' ? 'en' : 'fr';
    if (!query) { return res.render('search_results', { articles: [], query: '', pageTitle: req.t('page_titles.search'), activePage: 'search' }); }
    const searchTerm = `%${query}%`;
    const sql = `SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name_${lang}) as tags FROM articles a LEFT JOIN article_tags at ON a.id = at.article_id LEFT JOIN tags t ON at.tag_id = t.id WHERE a.title_fr LIKE ? OR a.title_en LIKE ? OR a.content_fr LIKE ? OR a.content_en LIKE ? GROUP BY a.id ORDER BY a.publication_date DESC`;
    db.all(sql, [searchTerm, searchTerm, searchTerm, searchTerm], (err, rows) => {
        if (err) { console.error("Erreur BDD (GET /search):", err); return res.status(500).send("Erreur serveur."); }
        const articlesWithData = rows.map(article => {
           const tagList = article.tags ? article.tags.split(',') : [];
           let finalCoverImage = null;
           if (article.cover_image_url) { finalCoverImage = article.cover_image_url; } else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
           const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
           return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
        });
        res.render('search_results', { articles: articlesWithData, query: query, pageTitle: `${req.t('search.results_for')} "${query}"`, activePage: 'search' });
    });
});

// --- FILTRAGE PAR TAG ---
app.get('/tags/:tagName', (req, res) => {
    const tagName = req.params.tagName;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const sqlFindTag = `SELECT id FROM tags WHERE name_${lang} = ?`;
    db.get(sqlFindTag, [tagName], (errTag, tag) => {
        if (errTag) { console.error(`Erreur BDD (GET /tags/${tagName} findTag):`, errTag); return res.status(500).send("Erreur serveur."); }
        if (!tag) { return res.render('journal', { articles: [], pageTitle: `Tag introuvable : "${tagName}"`, activePage: 'journal', currentPage: 1, totalPages: 0, currentTag: tagName }); }
        const tagId = tag.id;
        const sqlEntries = `SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name_${lang}) as tags FROM articles a JOIN article_tags at ON a.id = at.article_id LEFT JOIN article_tags at_all ON a.id = at_all.article_id LEFT JOIN tags t ON at_all.tag_id = t.id WHERE at.tag_id = ? GROUP BY a.id ORDER BY a.publication_date DESC LIMIT ? OFFSET ?`;
        const sqlCount = `SELECT COUNT(*) as totalCount FROM article_tags WHERE tag_id = ?`;
        db.all(sqlEntries, [tagId, ITEMS_PER_PAGE, offset], (err, rows) => {
            if (err) { console.error(`Erreur BDD (GET /tags/${tagName} entries):`, err); return res.status(500).send("Erreur serveur."); }
            db.get(sqlCount, [tagId], (errCount, countResult) => {
                 if (errCount) { console.error(`Erreur BDD (GET /tags/${tagName} count):`, errCount); return res.status(500).send("Erreur serveur."); }
                 const totalEntries = countResult.totalCount;
                 const totalPages = Math.ceil(totalEntries / ITEMS_PER_PAGE);
                 const articlesWithData = rows.map(article => {
                     const tagList = article.tags ? article.tags.split(',') : [];
                     let finalCoverImage = null;
                     if (article.cover_image_url) { finalCoverImage = article.cover_image_url; } else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
                     const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
                     return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
                 });
                 res.render('journal', { articles: articlesWithData, pageTitle: `Tag : "${tagName}"`, activePage: 'journal', currentPage: currentPage, totalPages: totalPages, currentTag: tagName });
            });
        });
    });
});

// --- AUTHENTIFICATION ET GESTION COMPTE ---

// Affiche le formulaire de connexion
app.get('/connexion', (req, res) => {
    const resetSuccess = req.query.reset === 'success';
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) { console.error("Erreur BDD (GET /connexion count):", err); return res.status(500).send("Erreur serveur."); }
        res.render('login', { pageTitle: req.t('page_titles.login'), error: null, adminExists: row.count > 0, activePage: 'admin', resetSuccess: resetSuccess });
    });
});

// Traite la tentative de connexion
app.post('/connexion', (req, res) => {
    const { username, password } = req.body;
    const sql = 'SELECT * FROM users WHERE username = ?';
    db.get(sql, [username], (err, user) => {
        if (err) { console.error("Erreur BDD (POST /connexion findUser):", err); return res.status(500).send("Erreur serveur."); }
        if (!user) { return res.render('login', { pageTitle: req.t('page_titles.login'), error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin', resetSuccess: false }); }
        bcrypt.compare(password, user.password, (errCompare, result) => {
            if (errCompare) { console.error("Erreur bcrypt compare:", errCompare); return res.render('login', { /* ... error: "Erreur serveur." ... */}); }
            if (result) {
                req.session.userId = user.id; req.session.username = user.username;
                res.redirect('/');
            } else { res.render('login', { pageTitle: req.t('page_titles.login'), error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin', resetSuccess: false }); }
        });
    });
});

// Route de déconnexion
app.get('/deconnexion', (req, res) => {
    req.session.destroy(err => {
        if (err) { console.error("Erreur déconnexion:", err); return res.redirect('/'); }
        res.clearCookie('connect.sid'); res.redirect('/');
    });
});

// Affiche/Traite le formulaire d'inscription (conditionnel)
app.get('/inscription', checkAdminExists, (req, res) => { 
    res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: null }); 
});

app.post('/inscription', checkAdminExists, (req, res) => {
    const { username, password, email } = req.body;
    if (!email || !email.includes('@')) { return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: 'Adresse email invalide.' }); }
    if (!password || password.length < 8) { return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: 'Le mot de passe doit faire au moins 8 caractères.' }); }
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (errHash, hash) => {
        if (errHash) { console.error("Erreur bcrypt hash (inscription):", errHash); return res.status(500).send("Erreur serveur."); }
        const sql = 'INSERT INTO users (username, password, email) VALUES (?, ?, ?)';
        db.run(sql, [username, hash, email], function(errInsert) {
            if (errInsert) {
                 let errorMessage = "Erreur création compte.";
                 if (errInsert.message.includes('UNIQUE constraint failed: users.username')) { errorMessage = "Ce nom d'utilisateur est déjà pris."; }
                 else if (errInsert.message.includes('UNIQUE constraint failed: users.email')) { errorMessage = "Cette adresse email est déjà utilisée."; }
                 console.error("Erreur BDD (POST /inscription insert):", errInsert);
                 return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: errorMessage });
            }
            res.redirect('/connexion');
        });
    });
});

// --- MOT DE PASSE OUBLIÉ ---
app.get('/forgot-password', (req, res) => { 
    res.render('forgot-password', { pageTitle: 'Mot de Passe Oublié', activePage: 'admin', error: null, info: null }); 
});

app.post('/forgot-password', async (req, res) => {
    const email = req.body.email;
    if (!email) { return res.render('forgot-password', { pageTitle: 'Mot de Passe Oublié', activePage: 'admin', error: 'Email requis.', info: null }); }
    if (!transporter) { return res.render('forgot-password', { pageTitle: 'Mot de Passe Oublié', activePage: 'admin', error: 'Service email non configuré.', info: null }); }
    const sqlFindUser = 'SELECT * FROM users WHERE email = ?';
    db.get(sqlFindUser, [email], async (err, user) => {
        if (err) { console.error("Erreur BDD (POST /forgot-password findUser):", err); } // Log error but continue
        // Always show the same message whether user exists or not
        const infoMsg = 'Si un compte avec cet email existe, un lien de réinitialisation a été envoyé.';
        if (!err && user) { // Only proceed if user found and no DB error
            const token = crypto.randomBytes(32).toString('hex');
            const expires = Date.now() + 3600000; // 1 hour
            const sqlUpdateToken = 'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?';
            db.run(sqlUpdateToken, [token, expires, user.id], (errUpdate) => {
                if (errUpdate) { console.error("Erreur BDD (POST /forgot-password updateToken):", errUpdate); return res.render('forgot-password', { /* ... error: 'Erreur serveur' ... */ }); }
                const resetLink = `http://${req.headers.host}/reset-password/${token}`;
                const mailOptions = { to: user.email, from: process.env.EMAIL_USER, subject: 'Réinitialisation mot de passe', text: `Cliquez ici: ${resetLink} (expire dans 1h)` };
                transporter.sendMail(mailOptions, (errMail) => {
                    if (errMail) { console.error("Erreur envoi email reset:", errMail); return res.render('forgot-password', { /* ... error: 'Erreur envoi email' ... */ }); }
                    res.render('forgot-password', { pageTitle: 'Mot de Passe Oublié', activePage: 'admin', error: null, info: infoMsg });
                });
            });
        } else { // User not found or DB error during search, still show info message
            res.render('forgot-password', { pageTitle: 'Mot de Passe Oublié', activePage: 'admin', error: null, info: infoMsg });
        }
    });
});

app.get('/reset-password/:token', (req, res) => {
    const token = req.params.token;
    const sqlFindToken = 'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?';
    db.get(sqlFindToken, [token, Date.now()], (err, user) => {
        if (err || !user) { return res.render('forgot-password', { pageTitle: 'Mot de Passe Oublié', activePage: 'admin', error: 'Lien invalide ou expiré.', info: null }); }
        res.render('reset-password', { pageTitle: 'Réinitialiser Mot de Passe', activePage: 'admin', token: token, error: null });
    });
});

app.post('/reset-password/:token', (req, res) => {
    const token = req.params.token;
    const { newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword || newPassword.length < 8) { return res.render('reset-password', { pageTitle: 'Réinitialiser Mot de Passe', activePage: 'admin', error: 'Mots de passe invalides (doivent correspondre, min 8 caractères).', token: token }); }
    const sqlFindToken = 'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?';
    db.get(sqlFindToken, [token, Date.now()], (err, user) => {
        if (err || !user) { return res.render('forgot-password', { pageTitle: 'Mot de Passe Oublié', activePage: 'admin', error: 'Lien invalide ou expiré.', info: null }); }
        const saltRounds = 10;
        bcrypt.hash(newPassword, saltRounds, (errHash, newHash) => {
            if (errHash) { return res.render('reset-password', { /* ... error: 'Erreur hachage.', token: token ... */ }); }
            const sqlUpdatePass = 'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?';
            db.run(sqlUpdatePass, [newHash, user.id], (errUpdate) => {
                if (errUpdate) { return res.render('reset-password', { /* ... error: 'Erreur mise à jour.', token: token ... */ }); }
                res.redirect('/connexion?reset=success');
            });
        });
    });
});

// --- CHANGER MOT DE PASSE (LOGGED IN) ---
app.get('/change-password', isAuthenticated, (req, res) => { 
    res.render('change-password', { pageTitle: 'Changer Mot de Passe', activePage: 'admin', error: null, success: null }); 
});

app.post('/change-password', isAuthenticated, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.userId;
    if (newPassword !== confirmPassword) { return res.render('change-password', { /* ... error: 'Correspondent pas.' ... */}); }
    if (newPassword.length < 8) { return res.render('change-password', { /* ... error: 'Trop court.' ... */}); }
    const sqlGetUser = 'SELECT * FROM users WHERE id = ?';
    db.get(sqlGetUser, [userId], (err, user) => {
        if (err || !user) { return res.render('change-password', { /* ... error: 'Utilisateur non trouvé.' ... */ }); }
        bcrypt.compare(currentPassword, user.password, (errCompare, result) => {
            if (errCompare || !result) { return res.render('change-password', { /* ... error: 'Actuel incorrect.' ... */ }); }
            const saltRounds = 10;
            bcrypt.hash(newPassword, saltRounds, (errHash, newHash) => {
                if (errHash) { return res.render('change-password', { /* ... error: 'Erreur hachage.' ... */ }); }
                const sqlUpdatePass = 'UPDATE users SET password = ? WHERE id = ?';
                db.run(sqlUpdatePass, [newHash, userId], (errUpdate) => {
                    if (errUpdate) { return res.render('change-password', { /* ... error: 'Erreur mise à jour BDD.' ... */ }); }
                    res.render('change-password', { /* ... success: 'Succès !' ... */ });
                });
            });
        });
    });
});

// --- API UPLOAD IMAGE ---
app.post('/upload-image', isAuthenticated, upload.single('image'), (req, res) => {
    if (!req.file) { return res.status(400).json({ error: 'Aucun fichier reçu.' }); }
    const imageUrl = '/uploads/' + req.file.filename;
    res.json({ imageUrl: imageUrl });
});

// --- FORMULAIRE CONTACT ---
app.post('/contact', (req, res) => { /* ... (code inchangé) ... */ });


// --- GESTION DU CONTENU (ROUTES PROTÉGÉES) ---

// Affiche le formulaire de création
app.get('/journal/nouvelle', isAuthenticated, (req, res) => { res.render('new_entry', { pageTitle: req.t('page_titles.new_entry'), activePage: 'journal' }); });

// Traite la création d'une entrée (bilingue + tags)
app.post('/journal', isAuthenticated, async (req, res) => {
    const { title_fr, title_en, content_fr, content_en, cover_image_url, tags } = req.body;
    const userId = req.session.userId;
    const tagNames = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    const sqlInsertArticle = 'INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id, cover_image_url) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sqlInsertArticle, [title_fr, title_en, content_fr, content_en, userId, cover_image_url], async function(err) {
        if (err) { console.error("Erreur BDD (POST /journal insert):", err); return res.status(500).send("Erreur serveur."); }
        const articleId = this.lastID;
        try { await processTags(articleId, tagNames); res.redirect('/journal'); }
        catch (tagError) { console.error("Erreur tags (POST /journal):", tagError); res.status(500).send("Erreur tags."); }
    });
});

// Affiche le formulaire de modification (bilingue + tags)
app.get('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const sqlArticle = "SELECT * FROM articles WHERE id = ?";
    const sqlTags = `SELECT t.name FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?`;
    db.get(sqlArticle, id, (err, article) => {
        if (err) { console.error(`Erreur BDD (GET /entree/${id}/edit article):`, err); return res.status(500).send("Erreur serveur."); }
        if (!article) { return res.status(404).send("Entrée non trouvée !");}
        db.all(sqlTags, id, (errTags, tagRows) => {
            if (errTags) { console.error(`Erreur BDD (GET /entree/${id}/edit tags):`, errTags); return res.status(500).send("Erreur serveur."); }
            const tagString = tagRows.map(tag => tag.name).join(', ');
            article.tags = tagString;
            res.render('edit_entry', { article: article, pageTitle: `${req.t('page_titles.edit_entry')}: ${article.title_fr}`, activePage: 'journal' });
        });
    });
});

// Traite la modification d'une entrée (bilingue + tags)
app.post('/entree/:id/edit', isAuthenticated, async (req, res) => {
    const id = req.params.id;
    const { title_fr, title_en, content_fr, content_en, cover_image_url, tags } = req.body;
    const tagNames = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    const sqlUpdateArticle = 'UPDATE articles SET title_fr = ?, title_en = ?, content_fr = ?, content_en = ?, cover_image_url = ? WHERE id = ?';
    db.run(sqlUpdateArticle, [title_fr, title_en, content_fr, content_en, cover_image_url, id], async function(err) {
        if (err) { console.error(`Erreur BDD (POST /entree/${id}/edit update):`, err); return res.status(500).send("Erreur serveur."); }
        try { await processTags(id, tagNames); res.redirect('/journal'); }
        catch (tagError) { console.error(`Erreur tags (POST /entree/${id}/edit):`, tagError); res.status(500).send("Erreur tags."); }
    });
});

// Traite la suppression d'une entrée
app.post('/entree/:id/delete', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM articles WHERE id = ?';
    db.run(sql, id, function(err) {
        if (err) { console.error(`Erreur BDD (POST /entree/${id}/delete):`, err); return res.status(500).send("Erreur serveur."); }
        res.redirect('/journal');
    });
});

// --- API POUR LA TRADUCTION ---
// Cette route est appelée par le script auto-translate-preview.js
app.post('/api/translate', isAuthenticated, async (req, res) => {
    // Vérifie si le client DeepL (translator) a bien été initialisé
    // (cela dépend de la présence de la clé API dans .env au démarrage)
    if (!translator) {
        console.error("[/api/translate] Erreur: translator non initialisé !");
        // Renvoie une erreur 503 (Service Unavailable) si DeepL n'est pas prêt
        return res.status(503).json({ error: 'Service de traduction non disponible.' });
    }

    // Récupère le texte à traduire et la langue cible depuis le corps de la requête JSON
    const textToTranslate = req.body.text;
    const targetLanguage = req.body.targetLang || 'en-GB'; // Anglais britannique par défaut

    // Vérifie si le texte est présent
    if (!textToTranslate) {
        console.log("[/api/translate] Erreur: textToTranslate est vide ou manquant.");
        return res.status(400).json({ error: 'Le champ "text" est manquant.' });
    }

    console.log(`[/api/translate] Tentative de traduction vers ${targetLanguage}`);

    try {
        // --- Appel à l'API DeepL via la bibliothèque deepl-node ---
        console.log("[/api/translate] >>> Appel à translator.translateText...");
        const result = await translator.translateText(textToTranslate, 'fr', targetLanguage); // Traduit DE 'fr' VERS targetLanguage
        console.log("[/api/translate] <<< Retour de translator.translateText.");
        // --- Fin Appel ---

        console.log("[/api/translate] Réponse brute de DeepL:", result);

        // Vérifie si la réponse contient bien le texte traduit
        if (result && typeof result.text === 'string') {
            console.log("[/api/translate] Traduction OK:", result.text.substring(0, 50) + "...");
            // Renvoie la traduction au format JSON
            res.json({ translatedText: result.text });
        } else {
            console.error("[/api/translate] Réponse DeepL invalide:", result);
            res.status(500).json({ error: 'Réponse invalide du service de traduction.' });
        }

    } catch (error) {
        // Gère les erreurs lors de l'appel à DeepL (clé invalide, limite atteinte, etc.)
        console.error("[/api/translate] Erreur DANS le bloc catch:", error);
        res.status(500).json({ error: `Échec traduction: ${error.message || 'Erreur inconnue'}` });
    }
});

// =================================================================
// 7. DÉMARRAGE DU SERVEUR
// =================================================================
app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});