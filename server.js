// =================================================================
// 1. IMPORTS (DÉPENDANCES)
// =================================================================
require('dotenv').config(); // Pour lire le .env (identifiants email, etc.)
const deepl = require('deepl-node');
const crypto = require('crypto');
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

// =================================================================
// 2. INITIALISATION ET CONFIGURATION D'EXPRESS
// =================================================================
const app = express();
const port = process.env.PORT || 3000;
const ITEMS_PER_PAGE = 5; // Pour la pagination

// Définir EJS comme moteur de template
app.set('view engine', 'ejs');

// Configuration du stockage pour Multer (upload d'images)
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- CONFIGURATION i18n (TRADUCTION INTERFACE) ---
i18next
  .use(FsBackend)
  .use(i18nextMiddleware.LanguageDetector)
  .init({
    backend: {
      loadPath: __dirname + '/locales/{{lng}}/translation.json',
    },
    fallbackLng: 'fr',
    preload: ['fr', 'en'],
    detection: {
      order: ['querystring', 'cookie', 'header'],
      caches: ['cookie'],
      cookieOptions: {
          path: '/',
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 jours
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
    console.warn("AVERTISSEMENT : Identifiants email manquants dans .env. Le formulaire de contact sera désactivé.");
}

const deeplApiKey = process.env.DEEPL_API_KEY;
let translator = null;
if (!deeplApiKey) {
    console.warn("AVERTISSEMENT : Clé API DeepL manquante. Traduction auto désactivée.");
} else {
    try {
        translator = new deepl.Translator(deeplApiKey);
        console.log("Client DeepL initialisé.");
    } catch (error) {
        console.error("Erreur initialisation DeepL:", error);
    }
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
  cookie: { secure: false } // Set true in production with HTTPS
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
    if (req.session.userId) { return next(); }
    // Return JSON error for API requests or unauthenticated page access needing login
    if (req.originalUrl.startsWith('/api/') || req.method !== 'GET') { // Check if API or non-GET request
         return res.status(401).json({ error: 'Accès non autorisé.' });
    }
    res.redirect('/connexion'); // Redirect only for standard GET page requests
}

// Middleware pour vérifier si un compte admin existe déjà
function checkAdminExists(req, res, next) {
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) {
            return res.status(500).send("Erreur serveur");
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
    return console.error(err.message);
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
db.run(createArticleTable);

// Création de la table 'users'
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
db.run(createUserTable);

// Création de la table 'tags'
const createTagsTable = `
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
`;
db.run(createTagsTable);

// Création de la table de liaison 'article_tags'
const createArticleTagsTable = `
CREATE TABLE IF NOT EXISTS article_tags (
  article_id INTEGER, tag_id INTEGER,
  FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);
`;
db.run(createArticleTagsTable);


// =================================================================
// 5. FONCTION HELPER POUR LES TAGS
// =================================================================
async function processTags(articleId, tagNames) {
    const tagIds = [];
    for (const name of tagNames) {
        let tag = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM tags WHERE name = ?', [name], (err, row) => err ? reject(err) : resolve(row));
        });
        if (!tag) {
             tag = await new Promise((resolve, reject) => {
                 db.run('INSERT INTO tags (name) VALUES (?)', [name], function(err) {
                     err ? reject(err) : resolve({ id: this.lastID });
                 });
             });
        }
        tagIds.push(tag.id);
    }
    await new Promise((resolve, reject) => {
         db.run('DELETE FROM article_tags WHERE article_id = ?', [articleId], (err) => err ? reject(err) : resolve());
    });
    if (tagIds.length > 0) {
        const placeholders = tagIds.map(() => '(?, ?)').join(',');
        const values = tagIds.reduce((acc, tagId) => acc.concat([articleId, tagId]), []);
        const sqlInsertLinks = `INSERT INTO article_tags (article_id, tag_id) VALUES ${placeholders}`;
        await new Promise((resolve, reject) => {
            db.run(sqlInsertLinks, values, (err) => err ? reject(err) : resolve());
        });
    }
}


// =================================================================
// 6. ROUTES
// =================================================================

// --- PAGES PUBLIQUES (LECTURE) ---

// Page d'accueil
app.get('/', (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sql = `
        SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name) as tags
        FROM articles a LEFT JOIN article_tags at ON a.id = at.article_id LEFT JOIN tags t ON at.tag_id = t.id
        GROUP BY a.id ORDER BY a.publication_date DESC LIMIT 3
    `;
    db.all(sql, [], (err, rows) => {
        if (err) { return res.status(500).send("Erreur BDD"); }
        const articlesWithData = rows.map(article => {
            const tagList = article.tags ? article.tags.split(',') : [];
            let finalCoverImage = null;
            if (article.cover_image_url) { finalCoverImage = article.cover_image_url; }
            else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
            const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
            return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
        });
        res.render('index', { articles: articlesWithData, pageTitle: req.t('page_titles.home'), activePage: 'accueil' });
    });
});

// Pages statiques
app.get('/profil', (req, res) => {
    res.render('profil', { pageTitle: req.t('page_titles.profile'), activePage: 'profil' });
});

app.get('/stage', (req, res) => {
    res.render('stage', { pageTitle: req.t('page_titles.internship'), activePage: 'stage' });
});

app.get('/contact', (req, res) => {
    res.render('contact', { pageTitle: req.t('page_titles.contact'), activePage: 'contact', messageSent: null });
});

// Page de tout le journal (avec pagination)
app.get('/journal', (req, res) => {
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sqlEntries = `
        SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name) as tags
        FROM articles a LEFT JOIN article_tags at ON a.id = at.article_id LEFT JOIN tags t ON at.tag_id = t.id
        GROUP BY a.id ORDER BY a.publication_date DESC LIMIT ? OFFSET ?
    `;
    const sqlCount = `SELECT COUNT(*) as totalCount FROM articles`;
    db.all(sqlEntries, [ITEMS_PER_PAGE, offset], (err, rows) => {
        if (err) { return res.status(500).send("Erreur BDD (entrées)"); }
        db.get(sqlCount, [], (errCount, countResult) => {
            if (errCount) { return res.status(500).send("Erreur BDD (compte)"); }
            const totalEntries = countResult.totalCount;
            const totalPages = Math.ceil(totalEntries / ITEMS_PER_PAGE);
            const articlesWithData = rows.map(article => {
                const tagList = article.tags ? article.tags.split(',') : [];
                let finalCoverImage = null;
                if (article.cover_image_url) { finalCoverImage = article.cover_image_url; }
                else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
                const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
                return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
            });
            res.render('journal', {
                articles: articlesWithData, pageTitle: req.t('page_titles.journal'), activePage: 'journal',
                currentPage: currentPage, totalPages: totalPages, currentTag: null // Pas de tag courant ici
            });
        });
    });
});

// Page de détail d'une entrée
app.get('/entree/:id', (req, res) => {
    const id = req.params.id;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sqlArticle = `
        SELECT id, title_${lang} as title, content_${lang} as content, cover_image_url, publication_date
        FROM articles WHERE id = ?
    `;
    const sqlTags = `SELECT t.name FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?`;
    db.get(sqlArticle, id, (err, article) => {
        if (err || !article) { return res.status(404).send("Entrée non trouvée !"); }
        db.all(sqlTags, id, (errTags, tagRows) => {
            if (errTags) { return res.status(500).send("Erreur BDD tags"); }
            article.tags = tagRows.map(tag => tag.name);
            let finalContent = article.content;
            const markdownTitle = '# ' + article.title;
            if (finalContent.trim().startsWith(markdownTitle)) {
                finalContent = finalContent.substring(markdownTitle.length).trim();
            }
            article.content = marked.parse(finalContent);
            res.render('entry_detail', { article: article, pageTitle: article.title, activePage: 'journal' });
        });
    });
});

// --- RECHERCHE ---
app.get('/search', (req, res) => {
    const query = req.query.query;
    const lang = req.language === 'en' ? 'en' : 'fr';
    if (!query) {
        return res.render('search_results', { articles: [], query: '', pageTitle: req.t('page_titles.search'), activePage: 'search' });
    }
    const searchTerm = `%${query}%`;
    const sql = `
        SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name) as tags
        FROM articles a LEFT JOIN article_tags at ON a.id = at.article_id LEFT JOIN tags t ON at.tag_id = t.id
        WHERE a.title_fr LIKE ? OR a.title_en LIKE ? OR a.content_fr LIKE ? OR a.content_en LIKE ?
        GROUP BY a.id ORDER BY a.publication_date DESC
    `;
    db.all(sql, [searchTerm, searchTerm, searchTerm, searchTerm], (err, rows) => {
        if (err) { return res.status(500).send("Erreur BDD recherche"); }
        const articlesWithData = rows.map(article => {
           const tagList = article.tags ? article.tags.split(',') : [];
           let finalCoverImage = null;
           if (article.cover_image_url) { finalCoverImage = article.cover_image_url; }
           else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
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
    const sqlFindTag = `SELECT id FROM tags WHERE name = ?`;
    db.get(sqlFindTag, [tagName], (errTag, tag) => {
        if (errTag) { return res.status(500).send("Erreur BDD (recherche tag)"); }
        if (!tag) {
             return res.render('journal', { articles: [], pageTitle: `Aucune entrée pour le tag "${tagName}"`, activePage: 'journal', currentPage: 1, totalPages: 0, currentTag: tagName });
        }
        const tagId = tag.id;
        const sqlEntries = `
            SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name) as tags
            FROM articles a JOIN article_tags at ON a.id = at.article_id LEFT JOIN article_tags at_all ON a.id = at_all.article_id LEFT JOIN tags t ON at_all.tag_id = t.id
            WHERE at.tag_id = ? GROUP BY a.id ORDER BY a.publication_date DESC LIMIT ? OFFSET ?
        `;
        const sqlCount = `SELECT COUNT(*) as totalCount FROM article_tags WHERE tag_id = ?`;
        db.all(sqlEntries, [tagId, ITEMS_PER_PAGE, offset], (err, rows) => {
            if (err) { return res.status(500).send("Erreur BDD (articles par tag)"); }
            db.get(sqlCount, [tagId], (errCount, countResult) => {
                 if (errCount) { return res.status(500).send("Erreur BDD (compte par tag)"); }
                 const totalEntries = countResult.totalCount;
                 const totalPages = Math.ceil(totalEntries / ITEMS_PER_PAGE);
                 const articlesWithData = rows.map(article => {
                     const tagList = article.tags ? article.tags.split(',') : [];
                     let finalCoverImage = null;
                     if (article.cover_image_url) { finalCoverImage = article.cover_image_url; }
                     else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
                     const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
                     return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
                 });
                 res.render('journal', { articles: articlesWithData, pageTitle: `Entrées pour le tag "${tagName}"`, activePage: 'journal', currentPage: currentPage, totalPages: totalPages, currentTag: tagName });
            });
        });
    });
});

// --- AUTHENTIFICATION ET API ---

// Affiche le formulaire de connexion
app.get('/connexion', (req, res) => {
    const resetSuccess = req.query.reset === 'success'; // Check for query parameter
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) { return res.status(500).send("Erreur serveur"); }
        res.render('login', { 
            pageTitle: req.t('page_titles.login'), 
            error: null, 
            adminExists: row.count > 0, 
            activePage: 'admin',
            resetSuccess: resetSuccess
         });
    });
});

// Traite la tentative de connexion
app.post('/connexion', (req, res) => {
    const { username, password } = req.body;
    const sql = 'SELECT * FROM users WHERE username = ?';
    db.get(sql, [username], (err, user) => {
        if (err) { return res.status(500).send("Erreur du serveur."); }
        if (!user) { return res.render('login', { pageTitle: req.t('page_titles.login'), error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin' }); }
        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.userId = user.id; req.session.username = user.username;
                res.redirect('/');
            } else { res.render('login', { pageTitle: req.t('page_titles.login'), error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin' }); }
        });
    });
});

// Route de déconnexion
app.get('/deconnexion', (req, res) => {
    req.session.destroy(err => {
        if (err) { return res.redirect('/'); }
        res.clearCookie('connect.sid'); res.redirect('/');
    });
});

// Affiche le formulaire d'inscription (conditionnel)
app.get('/inscription', checkAdminExists, (req, res) => {
    res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin' });
});

// Traite la création du premier admin
app.post('/inscription', checkAdminExists, (req, res) => {
    const { username, password, email } = req.body;

    if (!email || !email.includes('@')) {
         return res.render('register', { pageTitle: req.t('general.page_title_register'), activePage: 'admin', error: 'Adresse email invalide.' });
    }
    if (!password || password.length < 8) {
         return res.render('register', { pageTitle: req.t('general.page_title_register'), activePage: 'admin', error: 'Le mot de passe doit faire au moins 8 caractères.' });
    }

    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) { return res.status(500).send("Erreur hachage."); }

        const sql = 'INSERT INTO users (username, password, email) VALUES (?, ?, ?)';

        db.run(sql, [username, hash, email], function(err) {
            if (err) {
                let errorMessage = "Erreur création compte.";
                if (err.message.includes('UNIQUE constraint failed: users.username')) {
                    errorMessage = "Ce nom d'utilisateur est déjà pris.";
                } else if (err.message.includes('UNIQUE constraint failed: users.email')) {
                    errorMessage = "Cette adresse email est déjà utilisée.";
                }
                return res.render('register', { pageTitle: req.t('general.page_title_register'), activePage: 'admin', error: errorMessage });
            }
            res.redirect('/connexion');
        });
    });
});

app.post('/api/translate', isAuthenticated, async (req, res) => {
    if (!translator) {
        return res.status(503).json({ error: 'Service de traduction non disponible.' });
    }
    const textToTranslate = req.body.text;
    const targetLanguage = req.body.targetLang || 'en-GB';
    if (!textToTranslate) {
        return res.status(400).json({ error: 'Le champ "text" est manquant.' });
    }
    try {
        const result = await translator.translateText(textToTranslate, 'fr', targetLanguage);
        if (result && typeof result.text === 'string') {
           res.json({ translatedText: result.text });
        } else {
            console.error("[DeepL] Réponse invalide:", result);
            res.status(500).json({ error: 'Réponse invalide du service de traduction.' });
        }
    } catch (error) {
        console.error("Erreur DeepL:", error);
        res.status(500).json({ error: `Échec traduction: ${error.message || 'Erreur inconnue'}` });
    }
});

// Endpoint d'API pour l'upload d'images
app.post('/upload-image', isAuthenticated, upload.single('image'), (req, res) => {
    if (!req.file) { return res.status(400).json({ error: 'Aucun fichier reçu.' }); }
    const imageUrl = '/uploads/' + req.file.filename;
    res.json({ imageUrl: imageUrl });
});

// --- TRAITEMENT DU FORMULAIRE DE CONTACT ---
app.post('/contact', (req, res) => {
    if (!transporter) {
        return res.status(503).render('contact', { pageTitle: req.t('page_titles.contact'), activePage: 'contact', messageSent: false });
    }
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
         return res.status(400).render('contact', { pageTitle: req.t('page_titles.contact'), activePage: 'contact', messageSent: false });
    }
    const mailOptions = {
        from: `"${name}" <${process.env.EMAIL_USER}>`, replyTo: email,
        to: process.env.EMAIL_TO, subject: `Nouveau message de ${name} via le Carnet de Stage`,
        text: `Nom: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        html: `<p><strong>Nom :</strong> ${name}</p><p><strong>Email :</strong> ${email}</p><hr><p><strong>Message :</strong></p><p>${message.replace(/\n/g, '<br>')}</p>`
    };
    transporter.sendMail(mailOptions, (error, info) => {
        let messageStatus = null;
        if (error) { console.error("Erreur envoi email:", error); messageStatus = false; }
        else { console.log('Email envoyé: ' + info.response); messageStatus = true; }
        res.render('contact', { pageTitle: req.t('page_titles.contact'), activePage: 'contact', messageSent: messageStatus });
    });
});

// --- GESTION DU CONTENU (ROUTES PROTÉGÉES) ---

// Affiche le formulaire de création
app.get('/journal/nouvelle', isAuthenticated, (req, res) => {
    res.render('new_entry', { pageTitle: req.t('page_titles.new_entry'), activePage: 'journal' });
});

// Traite la création d'une entrée (bilingue + tags)
app.post('/journal', isAuthenticated, async (req, res) => {
    const { title_fr, title_en, content_fr, content_en, cover_image_url, tags } = req.body;
    const userId = req.session.userId;
    const tagNames = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    const sqlInsertArticle = 'INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id, cover_image_url) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sqlInsertArticle, [title_fr, title_en, content_fr, content_en, userId, cover_image_url], async function(err) {
        if (err) { return res.status(500).send("Erreur création entrée."); }
        const articleId = this.lastID;
        try {
            await processTags(articleId, tagNames);
            res.redirect('/journal');
        } catch (tagError) {
            console.error("Erreur traitement tags (création):", tagError);
            res.status(500).send("Erreur lors de l'ajout des tags.");
        }
    });
});

// Affiche le formulaire de modification (bilingue + tags)
app.get('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const sqlArticle = "SELECT * FROM articles WHERE id = ?";
    const sqlTags = `SELECT t.name FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?`;
    db.get(sqlArticle, id, (err, article) => {
        if (err || !article) { return res.status(404).send("Entrée non trouvée !"); }
        db.all(sqlTags, id, (errTags, tagRows) => {
            if (errTags) { return res.status(500).send("Erreur BDD tags"); }
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
        if (err) { return res.status(500).send("Erreur mise à jour entrée."); }
        try {
            await processTags(id, tagNames);
            res.redirect('/journal');
        } catch (tagError) {
            console.error("Erreur traitement tags (modif):", tagError);
            res.status(500).send("Erreur lors de la mise à jour des tags.");
        }
    });
});

// Traite la suppression d'une entrée
app.post('/entree/:id/delete', isAuthenticated, (req, res) => {
    const id = req.params.id;
    // ON DELETE CASCADE gère la suppression dans article_tags
    const sql = 'DELETE FROM articles WHERE id = ?';
    db.run(sql, id, function(err) {
        if (err) { return res.status(500).send("Erreur suppression entrée."); }
        res.redirect('/journal');
    });
});

// Affiche le formulaire pour changer le mot de passe
app.get('/change-password', isAuthenticated, (req, res) => {
    res.render('change-password', {
        pageTitle: 'Changer le Mot de Passe',
        activePage: 'admin', // Ou une autre page active si pertinent
        error: null,    // Pour afficher les erreurs
        success: null   // Pour afficher le succès
    });
});

// Traite la demande de changement de mot de passe
app.post('/change-password', isAuthenticated, async (req, res) => { // Ajout de async
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.userId; // Récupère l'ID de l'utilisateur connecté

    // Vérifie si les nouveaux mots de passe correspondent
    if (newPassword !== confirmPassword) {
        return res.render('change-password', {
            pageTitle: 'Changer le Mot de Passe', activePage: 'admin',
            error: 'Les nouveaux mots de passe ne correspondent pas.', success: null
        });
    }

    // Ajout d'une vérification de longueur minimale (ex: 8 caractères)
     if (newPassword.length < 8) {
         return res.render('change-password', {
             pageTitle: 'Changer le Mot de Passe', activePage: 'admin',
             error: 'Le nouveau mot de passe doit faire au moins 8 caractères.', success: null
         });
     }

    // Récupère l'utilisateur actuel pour vérifier son mot de passe
    const sqlGetUser = 'SELECT * FROM users WHERE id = ?';
    db.get(sqlGetUser, [userId], (err, user) => {
        if (err || !user) {
            return res.render('change-password', {
                pageTitle: 'Changer le Mot de Passe', activePage: 'admin',
                error: 'Utilisateur non trouvé ou erreur serveur.', success: null
            });
        }

        // Compare le mot de passe actuel fourni avec celui haché dans la BDD
        bcrypt.compare(currentPassword, user.password, (errCompare, result) => {
            if (errCompare || !result) {
                return res.render('change-password', {
                    pageTitle: 'Changer le Mot de Passe', activePage: 'admin',
                    error: 'Le mot de passe actuel est incorrect.', success: null
                });
            }

            // Si le mot de passe actuel est correct, on hache le nouveau
            const saltRounds = 10;
            bcrypt.hash(newPassword, saltRounds, (errHash, newHash) => {
                if (errHash) {
                    return res.render('change-password', {
                        pageTitle: 'Changer le Mot de Passe', activePage: 'admin',
                        error: 'Erreur lors du hachage du nouveau mot de passe.', success: null
                    });
                }

                // Met à jour le mot de passe dans la base de données
                const sqlUpdatePass = 'UPDATE users SET password = ? WHERE id = ?';
                db.run(sqlUpdatePass, [newHash, userId], (errUpdate) => {
                    if (errUpdate) {
                         return res.render('change-password', {
                            pageTitle: 'Changer le Mot de Passe', activePage: 'admin',
                            error: 'Erreur lors de la mise à jour du mot de passe.', success: null
                        });
                    }

                    // Succès ! On affiche un message
                    res.render('change-password', {
                        pageTitle: 'Changer le Mot de Passe', activePage: 'admin',
                        error: null, success: 'Mot de passe mis à jour avec succès !'
                    });
                });
            });
        });
    });
});

// Show forgot password form
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', {
        pageTitle: 'Mot de Passe Oublié',
        activePage: 'admin', // Or appropriate page
        error: null,
        info: null
    });
});

// Handle forgot password request (generate token & send email)
app.post('/forgot-password', async (req, res) => {
    const email = req.body.email;
    if (!email) {
        return res.render('forgot-password', { /* ... error: 'Email requis' ... */ });
    }
    if (!transporter) { // Check if Nodemailer is configured
         return res.render('forgot-password', { /* ... error: 'Service email non configuré' ... */ });
    }

    // Find user by email
    const sqlFindUser = 'SELECT * FROM users WHERE email = ?';
    db.get(sqlFindUser, [email], async (err, user) => {
        if (err || !user) {
            // IMPORTANT: Don't reveal if the email exists or not for security
            return res.render('forgot-password', { /* ... info: 'Si un compte existe..., un email a été envoyé.' ... */ });
        }

        // Generate a secure random token
        const token = crypto.randomBytes(32).toString('hex');
        // Set expiration time (e.g., 1 hour from now)
        const expires = Date.now() + 3600000; // 1 hour in milliseconds

        // Store token and expiration in the database
        const sqlUpdateToken = 'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?';
        db.run(sqlUpdateToken, [token, expires, user.id], (errUpdate) => {
            if (errUpdate) {
                 console.error("Error saving reset token:", errUpdate);
                 return res.render('forgot-password', { /* ... error: 'Erreur serveur' ... */ });
            }

            // Send the email
            const resetLink = `http://${req.headers.host}/reset-password/${token}`; // Construct reset link
            const mailOptions = {
                to: user.email,
                from: process.env.EMAIL_USER,
                subject: 'Réinitialisation de votre mot de passe - Carnet de Stage',
                text: `Vous recevez cet email car vous (ou quelqu'un d'autre) avez demandé la réinitialisation du mot de passe de votre compte.\n\n` +
                      `Cliquez sur le lien suivant, ou copiez-le dans votre navigateur pour compléter le processus :\n\n` +
                      `${resetLink}\n\n` +
                      `Si vous n'avez pas demandé ceci, ignorez cet email et votre mot de passe restera inchangé.\n` +
                      `Ce lien expirera dans une heure.\n`,
                // You can add an HTML version too
            };

            transporter.sendMail(mailOptions, (errMail) => {
                if (errMail) {
                     console.error("Error sending reset email:", errMail);
                     return res.render('forgot-password', { /* ... error: 'Erreur envoi email' ... */ });
                }
                res.render('forgot-password', { /* ... info: 'Email de réinitialisation envoyé.' ... */ });
            });
        });
    });
});

// Show password reset form (if token is valid)
app.get('/reset-password/:token', (req, res) => {
    const token = req.params.token;
    // Find user by token and check expiration
    const sqlFindToken = 'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?';
    db.get(sqlFindToken, [token, Date.now()], (err, user) => {
        if (err || !user) {
            // Token invalid or expired
            return res.render('forgot-password', { /* ... error: 'Lien invalide ou expiré.' ... */ });
        }
        // Show the reset form, passing the token
        res.render('reset-password', {
            pageTitle: 'Réinitialiser le Mot de Passe',
            activePage: 'admin',
            token: token,
            error: null
        });
    });
});

// Handle password reset submission
app.post('/reset-password/:token', (req, res) => {
    const token = req.params.token;
    const { newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword || newPassword.length < 8) {
        // Passwords don't match or too short
        return res.render('reset-password', { /* ... error: 'Mots de passe invalides.', token: token ... */ });
    }

    // Find user by token again (double check validity)
    const sqlFindToken = 'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?';
    db.get(sqlFindToken, [token, Date.now()], (err, user) => {
        if (err || !user) {
            return res.render('forgot-password', { /* ... error: 'Lien invalide ou expiré.' ... */ });
        }

        // Hash the new password
        const saltRounds = 10;
        bcrypt.hash(newPassword, saltRounds, (errHash, newHash) => {
            if (errHash) {
                return res.render('reset-password', { /* ... error: 'Erreur hachage.', token: token ... */ });
            }

            // Update password and clear the reset token fields
            const sqlUpdatePass = 'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?';
            db.run(sqlUpdatePass, [newHash, user.id], (errUpdate) => {
                if (errUpdate) {
                     return res.render('reset-password', { /* ... error: 'Erreur mise à jour.', token: token ... */ });
                }
                // Redirect to login page with success message (using query parameter)
                res.redirect('/connexion?reset=success');
            });
        });
    });
});

// --- PAGE ADMINISTRATION ---
app.get('/admin', isAuthenticated, (req, res) => {
    res.render('admin', {
        pageTitle: 'Panneau d\'Administration',
        activePage: 'admin' // Garde le lien "Administration" actif
    });
});

// =================================================================
// 7. DÉMARRAGE DU SERVEUR
// =================================================================
app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});