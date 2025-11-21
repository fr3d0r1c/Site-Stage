// =================================================================
// 1. IMPORTS (DÉPENDANCES)
// =================================================================
require('dotenv').config(); 
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { marked } = require('marked'); 
const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const FsBackend = require('i18next-fs-backend');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp'); 
const fs = require('fs');
const deepl = require('deepl-node');
const Filter = require('bad-words');
const frenchBadWordsList = require('french-badwords-list').array;
const SQLiteStore = require('connect-sqlite3')(session);
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer');

// =================================================================
// 2. INITIALISATION ET CONFIGURATION D'EXPRESS
// =================================================================
const app = express(); // Crée l'application Express
const port = process.env.PORT || 3000;
const ITEMS_PER_PAGE = 5; // Pour la pagination

// Définir EJS comme moteur de template
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Chemin vers le dossier views

// Configuration du stockage pour Multer (upload d'images)
const storage = multer.diskStorage({ /* ... (ton code multer) ... */ });
const upload = multer({ storage: storage });

// --- CONFIGURATION i18n (TRADUCTION INTERFACE + DÉTECTION) ---
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
                maxAge: 30 * 24 * 60 * 60 * 1000
            }
        }
    });

// --- NODEMAILER CONFIGURATION ---
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    console.log("✅ Nodemailer configuré avec succès.");

} else {
    console.warn("⚠️ AVERTISSEMENT : Identifiants email (EMAIL_USER, EMAIL_PASS) manquants dans .env.");
    console.warn("   -> Les fonctionnalités suivantes seront désactivées :");
    console.warn("      - Formulaire de contact");
    console.warn("      - Réinitialisation de mot de passe");
    console.warn("      - Notifications de commentaires");
}

// --- DEEPL INITIALIZATION --- (Vérifie bien ceci)
const deeplApiKey = process.env.DEEPL_API_KEY;
let translator = null; // Défini avec 'let' dans le scope global du module
if (deeplApiKey) {
    try {
         translator = new deepl.Translator(deeplApiKey); // 'deepl' (en minuscule) vient de l'import
         console.log("Client DeepL initialisé.");
    } catch (error) {
        console.error("Erreur initialisation DeepL:", error);
    }
} else {
    console.warn("AVERTISSEMENT : Clé API DeepL manquante.");
}

// =================================================================
// 3. MIDDLEWARES
// =================================================================

// --- Configuration Helmet & CSP ---
// Doit être placé en premier pour appliquer les en-têtes de sécurité
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], // N'autorise que le même domaine par défaut
        scriptSrc: [
          "'self'", // Scripts du même domaine (ex: /js/main.js)
          "https://cdn.jsdelivr.net/npm/marked/marked.min.js", // CDN Marked.js
          "https://unpkg.com/easymde/dist/easymde.min.js", // CDN EasyMDE JS
          "https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js", // CDN SweetAlert2 JS
          "https://cdn.jsdelivr.net/",
          "https://unpkg.com/"
        ],
        styleSrc: [
          "'self'",
          "https://unpkg.com/easymde/dist/easymde.min.css",
          "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/",
          "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/",
          "https://fonts.googleapis.com/",
          "https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css",
          "https://maxcdn.bootstrapcdn.com/font-awesome/latest/css/font-awesome.min.css", // <-- AJOUTE CETTE LIGNE
          "'unsafe-inline'",
          "https://unpkg.com/"
        ],
        imgSrc: [
          "'self'", // Images du même domaine (tes uploads)
          "data:", // Images encodées (ex: data:image/png;...)
          "https://via.placeholder.com", // Images d'exemple
          "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/", // SVG des drapeaux
          "https:",
          "https://*.tile.openstreetmap.org",
          "https://unpkg.com"
        ],
        fontSrc: [
            "'self'",
            "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/",
            "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/",
            "https://fonts.gstatic.com",
            "https://maxcdn.bootstrapcdn.com/"
        ],
        connectSrc: [
          "'self'",
          "https://cdn.jsdelivr.net/",
          "https://unpkg.com"
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
        manifestSrc: ["'self'"]
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

// --- CONFIGURATION MODÉRATEUR AUTO ---
const filter = new Filter();

filter.addWords(...frenchBadWordsList);

// filter.addWords(...frenchBadWordsList);
filter.addWords('testbad');

// Servir les fichiers statiques (CSS, JS, images) depuis le dossier 'public'
app.use(express.static('public'));

// Middleware pour lire les données de formulaire (ex: <form method="POST">)
app.use(express.urlencoded({ extended: true }));

// Middleware pour lire le JSON (ex: fetch)
app.use(express.json());

// Configuration du middleware de session (pour la connexion admin)
const isProduction = process.env.NODE_ENV === 'production';

app.use(session({
    store: new SQLiteStore({ 
        db: 'sessions.db', 
        dir: __dirname 
    }),
    secret: 'Z6*31121Mt',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// --- MIDDLEWARE GLOBAL POUR LES MESSAGES FLASH ---
app.use((req, res, next) => {
    res.locals.username = req.session.username;
    res.locals.userId = req.session.userId;

    res.locals.message = req.session.flashMessage;
    delete req.session.flashMessage;
    next();
});

// Middleware pour i18next (traduction)
app.use(i18nextMiddleware.handle(i18next));

// Middleware "maison" (garde) pour vérifier si l'utilisateur est authentifié
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next(); // L'utilisateur est connecté, on continue
    }
    // Si c'est une requête API (ex: upload), renvoie une erreur JSON
    if (req.originalUrl.startsWith('/upload-image') || req.originalUrl.startsWith('/api/')) {
       return res.status(401).json({ error: 'Accès non autorisé. Veuillez vous reconnecter.' });
    }
    // Pour les pages normales, redirige vers la page de connexion
    res.redirect('/connexion');
}

// Middleware "maison" (garde) pour vérifier si un compte admin existe déjà
function checkAdminExists(req, res, next) {
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) {
            console.error("Erreur BDD (checkAdminExists):", err);
            return res.status(500).send("Erreur serveur lors de la vérification admin.");
        }
        if (row.count === 0) {
            next(); // Aucun admin n'existe, on autorise l'accès (ex: à /inscription)
        } else {
            res.redirect('/connexion'); // Un admin existe, on redirige
        }
    });
}

// --- Configuration des Rate Limiters (Anti-Spam/Brute Force) ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limite chaque IP à 100 requêtes
    standardHeaders: true, 
    legacyHeaders: false,
    message: { error: 'Trop de requêtes depuis cette IP, veuillez réessayer après 15 minutes.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limite les tentatives d'authentification à 5
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de tentatives de connexion/reset depuis cette IP, veuillez réessayer après 15 minutes.' }
});

const contactLimiter = rateLimit({
     windowMs: 60 * 60 * 1000, // 1 heure
     max: 10, // Limite les envois de formulaire de contact à 10
     standardHeaders: true,
     legacyHeaders: false,
     handler: (req, res, next, options) => {
         // Recharge la page contact avec une erreur
         res.status(options.statusCode).render('contact', {
             pageTitle: req.t('page_titles.contact'),
             activePage: 'contact',
             messageSent: false,
             error: options.message.error
         });
     }
});

const commentLimiter = rateLimit({
     windowMs: 10 * 60 * 1000, // 10 minutes
     max: 5, // Limite les envois de commentaires à 5
     standardHeaders: true,
     legacyHeaders: false,
     // Pour les commentaires, on redirige silencieusement avec une erreur
     handler: (req, res, next, options) => {
         console.warn(`Rate limit dépassé pour les commentaires (IP: ${req.ip})`);
         res.redirect(`/entree/${req.params.id}?comment=error`);
     }
});

// =================================================================
// 4. CONNEXION À LA BASE DE DONNÉES ET CRÉATION DES TABLES
// =================================================================

// Choisit la BDD : en mémoire (vide) pour les tests, ou le fichier pour le dev/prod
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : './blog.db';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    // Log fatal si la BDD échoue
    console.error("Erreur fatale: Impossible de se connecter à la base de données SQLite.", err);
    process.exit(1); // Quitte l'application si la BDD ne peut pas s'ouvrir
  }
  console.log(`Connecté à la base de données SQLite : ${dbPath}`);

  // Active les contraintes de clé étrangère (pour ON DELETE CASCADE)
  db.run('PRAGMA foreign_keys = ON;', (errPragma) => {
    if (errPragma) console.error("Erreur activation clés étrangères:", errPragma);
  });
});

// Création de la table 'articles' (version bilingue + cover + résumé)
const createArticleTable = `
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
  summary_fr TEXT, summary_en TEXT, -- NOUVEAUX CHAMPS
  content_fr TEXT NOT NULL, content_en TEXT NOT NULL,
  cover_image_url TEXT,
  publication_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);
`;

db.run(createArticleTable, (err) => {
    if (err) console.error("Erreur création table articles:", err);
});

// Création de la table 'users'
const createUserTable = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  email TEXT UNIQUE,
  reset_token TEXT,
  reset_token_expires INTEGER,
  two_fa_secret TEXT,
  two_fa_enabled INTEGER DEFAULT 0,
  two_fa_prompted INTEGER DEFAULT 0
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

// Création de la table 'comments'
const createCommentsTable = `
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_approved INTEGER DEFAULT 0,          -- 0 = En attente, 1 = Approuvé
  FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
);
`;
db.run(createCommentsTable, (err) => {
    if (err) console.error("Erreur création table comments:", err);
});

// Création de la table 'audit_logs'
const createAuditTable = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,      
  details TEXT,              
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
db.run(createAuditTable, (err) => {
    if (err) console.error("Erreur création table audit_logs:", err);
});


// =================================================================
// 5. FONCTION HELPER POUR LES TAGS
// =================================================================
async function processTags(articleId, tagIds) {
    const validIds = Array.isArray(tagIds)
        ? tagIds.map(id => parseInt(id)).filter(id => !isNaN(id))
        : [];
    
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
        await deleteLinks(articleId);
        await insertLinks(articleId, validIds);
    } catch (error) {
        console.error(`Erreur dans processTags pour l'article ${articleId}:`, error);
        throw error;
    }
}


async function sendAdminNotification(req, articleId, commentId, authorName, commentContent) {
    // Vérifie si l'envoi d'email est configuré
    if (!transporter) {
        console.warn("[sendAdminNotification] Nodemailer non configuré. Notification admin non envoyée.");
        return; // Ne fait rien si le transporter n'est pas prêt
    }

    try {
        // 1. Récupérer le titre de l'article pour le contexte
        const sqlGetArticle = `SELECT title_fr FROM articles WHERE id = ?`; // Prend le titre FR par défaut pour l'admin
        const article = await new Promise((resolve, reject) => {
            db.get(sqlGetArticle, [articleId], (err, row) => err ? reject(err) : resolve(row));
        });
        const articleTitle = article ? article.title_fr : "un article"; // Fallback

        // 2. Construire un lien direct vers la page de modération
        const protocol = req.protocol; // http ou https
        const host = req.get('host'); // localhost:3000 ou ton-site.onrender.com
        const moderationLink = `${protocol}://${host}/admin/comments`;

        // 3. Préparer l'email
        const mailOptions = {
            from: process.env.EMAIL_USER, // Expéditeur (ton email)
            to: process.env.EMAIL_TO,     // Destinataire (toi, l'admin)
            subject: `Nouveau Commentaire sur "${articleTitle}"`,
            text: `Un nouveau commentaire (ID: ${commentId}) a été posté par "${authorName}" sur l'article "${articleTitle}".\n\n` +
                  `Contenu:\n${commentContent}\n\n` +
                  `Approuvez-le ici : ${moderationLink}\n`,
            html: `
                <p>Un nouveau commentaire (ID: <strong>${commentId}</strong>) a été posté par <strong>${authorName}</strong> sur l'article "${articleTitle}".</p>
                <hr>
                <p><strong>Contenu :</strong></p>
                <blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 5px; font-style: italic;">
                    ${commentContent.replace(/\n/g, '<br>')}
                </blockquote>
                <hr>
                <p>Veuillez le modérer dans votre <a href="${moderationLink}">panneau d'administration</a>.</p>
            `
        };

        // 4. Envoyer l'email
        await transporter.sendMail(mailOptions);
        console.log(`Notification admin envoyée pour le commentaire ${commentId}`);

    } catch (emailError) {
        // Si l'envoi de l'email échoue, on l'affiche seulement dans la console
        // L'utilisateur, lui, ne doit pas être bloqué pour ça.
        console.error(`Erreur lors de l'envoi de l'email de notification admin (Commentaire ${commentId}):`, emailError);
    }
}

/**
 * Enregistre une action dans le journal d'audit.
 * @param {object} req - L'objet requête (pour l'IP et la session)
 * @param {string} action - Le nom de l'action (ex: 'LOGIN_SUCCESS')
 * @param {string} details - Détails optionnels (ex: 'Article ID 5')
 */
function logAction(req, action, details = '') {
    const userId = req.session ? req.session.userId : null;
    const username = req.session ? req.session.username : 'Anonyme/Système';
    const ip = req.ip || req.connection.remoteAddress;

    const sql = `INSERT INTO audit_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)`;

    db.run(sql, [userId, username, action, details, ip], (err) => {
        if (err) console.error("Erreur écriture audit log:", err);
    });
}

// =================================================================
// 6. ROUTES (Le Cœur de l'Application)
// =================================================================

// --- Routes Publiques (Lecture & Navigation) ---

// Accueil
app.get('/', (req, res) => {

    console.log("GET / - Session ID reçue :", req.sessionID);
    console.log("GET / - User ID dans la session :", req.session.userId);

    const lang = req.language === 'en' ? 'en' : 'fr';

    // Récupère les 3 derniers articles
    const sql = `
        SELECT
            a.id, a.title_${lang} as title, a.summary_${lang} as summary, a.content_${lang} as content,
            a.cover_image_url, a.publication_date,
            GROUP_CONCAT(t.name_${lang}) as tags
        FROM articles a
        LEFT JOIN article_tags at ON a.id = at.article_id
        LEFT JOIN tags t ON at.tag_id = t.id
        GROUP BY a.id
        ORDER BY a.publication_date DESC
        LIMIT 3
    `;

    db.all(sql, [], (err, rows) => {
        if (err) { console.error("Erreur BDD (GET /):", err); return res.status(500).send("Erreur serveur."); }

        const articlesWithData = rows.map(article => {
            const tagList = article.tags ? article.tags.split(',') : [];

            // Gestion image de couverture
            let finalCoverImage = article.cover_image_url;
            if (!finalCoverImage) {
                const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                finalCoverImage = match ? match[1] : null;
            }

            let excerpt = "";

            if (article.summary) {
                excerpt = article.summary;
            }
            else {
                let textContent = article.content.replace(/!\[.*?\]\(.*?\)/g, ''); // Enlève images
                textContent = textContent.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim(); // Enlève titre H1
                const plainContent = textContent.replace(/[#*`~_]|(\[.*?\]\(.*?\))/g, ''); // Enlève markdown
                excerpt = plainContent.substring(0, 350) + "..."; // Coupe et ajoute "..."
            }

            return {
                ...article,
                tags: tagList,
                coverImage: finalCoverImage,
                excerpt: excerpt
            };
        });

        // Gestion message flash
        const message = req.session.flashMessage;
        req.session.flashMessage = null;

        res.render('index', {
            articles: articlesWithData,
            pageTitle: req.t('page_titles.home'),
            activePage: 'accueil',
            message: message
        });
    });
});

// Pages Statiques (Profil & Stage)
app.get('/profil/qui-suis-je', (req, res) => {
    res.render('whoami', { pageTitle: 'Qui suis-je ?', activePage: 'profil' });
});
app.get('/profil/parcours-scolaire', (req, res) => {
    res.render('school', { pageTitle: 'Parcours Scolaire', activePage: 'profil' });
});
app.get('/profil/parcours-pro', (req, res) => {
    res.render('work', { pageTitle: 'Parcours Professionnel', activePage: 'profil' });
});
app.get('/stage/l-entreprise', (req, res) => {
    res.render('company', { pageTitle: "L'entreprise", activePage: 'stage' });
});
app.get('/stage/mes-missions', (req, res) => {
    res.render('missions', { pageTitle: 'Mes Missions', activePage: 'stage' });
});

// Journal & Articles
app.get('/journal', (req, res) => {
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const lang = req.language === 'en' ? 'en' : 'fr';

    // --- LOGIQUE DE TRI ---
    const sortOption = req.query.sort || 'date_desc';
    let sortClause = 'ORDER BY a.publication_date DESC';

    switch (sortOption) {
        case 'date_asc': sortClause = 'ORDER BY a.publication_date ASC'; break;
        case 'alpha_asc': sortClause = `ORDER BY title_${lang} ASC`; break;
        case 'alpha_desc': sortClause = `ORDER BY title_${lang} DESC`; break;
        case 'tag_asc': sortClause = 'ORDER BY tags ASC'; break;
        case 'tag_desc': sortClause = 'ORDER BY tags DESC'; break;
    }

    const sqlEntries = `
        SELECT
            a.id, a.title_${lang} as title, a.summary_${lang} as summary, a.content_${lang} as content,
            a.cover_image_url, a.publication_date,
            GROUP_CONCAT(t.name_${lang}) as tags
        FROM articles a
        LEFT JOIN article_tags at ON a.id = at.article_id
        LEFT JOIN tags t ON at.tag_id = t.id
        GROUP BY a.id
        ${sortClause}
        LIMIT ? OFFSET ?
    `;
    const sqlCount = `SELECT COUNT(*) as totalCount FROM articles`;

    db.all(sqlEntries, [ITEMS_PER_PAGE, offset], (err, rows) => {
        if (err) { console.error("Erreur BDD (GET /journal entries):", err); return res.status(500).send("Erreur serveur."); }

        db.get(sqlCount, [], (errCount, countResult) => {
            if (errCount) { console.error("Erreur BDD (GET /journal count):", errCount); return res.status(500).send("Erreur serveur."); }

            const totalEntries = countResult.totalCount;
            const totalPages = Math.ceil(totalEntries / ITEMS_PER_PAGE);

            const articlesWithData = rows.map(article => {
                const tagList = article.tags ? article.tags.split(',') : [];

                let finalCoverImage = article.cover_image_url;
                if (!finalCoverImage) {
                    const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                    finalCoverImage = match ? match[1] : null;
                }

                let excerpt = "";

                if (article.summary) {
                    excerpt = article.summary;
                }
                else {
                    let textContent = article.content.replace(/!\[.*?\]\(.*?\)/g, ''); // Enlève images
                    textContent = textContent.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim(); // Enlève titre H1
                    const plainContent = textContent.replace(/[#*`~_]|(\[.*?\]\(.*?\))/g, ''); // Enlève markdown
                    excerpt = plainContent.substring(0, 350) + "..."; // Coupe et ajoute "..."
                }
                

                return { 
                    ...article, 
                    tags: tagList, 
                    coverImage: finalCoverImage, 
                    excerpt: excerpt 
                };
            });

            const message = req.session.flashMessage;
            req.session.flashMessage = null;

            res.render('journal', {
                articles: articlesWithData,
                pageTitle: req.t('page_titles.journal'),
                activePage: 'journal',
                currentPage: currentPage,
                totalPages: totalPages,
                currentTag: null,
                message: message,
                currentSort: sortOption
            });
        });
    });
});
app.get('/entree/:id', (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { return res.status(400).send("ID d'entrée invalide."); }

    const lang = req.language === 'en' ? 'en' : 'fr';

    // Requête pour l'article actuel
    const sqlArticle = `SELECT *, title_${lang} as title, content_${lang} as content FROM articles WHERE id = ?`;
    // Requête pour les tags
    const sqlTags = `SELECT t.name_${lang} as name FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?`;
    // Requête pour les commentaires approuvés
    const sqlComments = `SELECT author_name, content, created_at FROM comments WHERE article_id = ? AND is_approved = 1 ORDER BY created_at ASC`;

    db.get(sqlArticle, id, (err, article) => {
        if (err) { console.error(`Erreur BDD (GET /entree/${id} article):`, err); return res.status(500).send("Erreur serveur."); }
        if (!article) { return res.status(404).send("Entrée non trouvée !"); }

        // On a la date de l'article, on prépare les requêtes Précédent/Suivant
        const currentPublicationDate = article.publication_date;
        const sqlPrev = `SELECT id, title_${lang} as title FROM articles WHERE publication_date < ? ORDER BY publication_date DESC LIMIT 1`;
        const sqlNext = `SELECT id, title_${lang} as title FROM articles WHERE publication_date > ? ORDER BY publication_date ASC LIMIT 1`;

        // On exécute les 4 requêtes restantes en parallèle
        Promise.all([
            new Promise((resolve, reject) => db.all(sqlTags, id, (err, rows) => err ? reject(err) : resolve(rows))),
            new Promise((resolve, reject) => db.get(sqlPrev, [currentPublicationDate], (err, row) => err ? reject(err) : resolve(row))),
            new Promise((resolve, reject) => db.get(sqlNext, [currentPublicationDate], (err, row) => err ? reject(err) : resolve(row))),
            new Promise((resolve, reject) => db.all(sqlComments, id, (err, rows) => err ? reject(err) : resolve(rows)))
        ]).then(([tagRows, prevEntry, nextEntry, comments]) => {

            article.tags = tagRows.map(tag => tag.name);

            // --- LOGIQUE SEO & OPEN GRAPH ---
            // Crée une description courte (extrait) pour les réseaux sociaux
            const ogDescription = (article.content || '')
                .replace(/!\[.*?\]\(.*?\)/g, '') // Enlève les images Markdown
                .replace(/[#*`~_]/g, '') // Enlève les symboles Markdown
                .replace(/\s+/g, ' ') // Remplace les espaces multiples par un seul
                .substring(0, 155).trim() + '...';

            // Détermine l'image de couverture (soit le champ dédié, soit la 1ère image du contenu)
            let ogImage = article.cover_image_url;
            if (!ogImage) {
                const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                ogImage = match ? match[1] : null;
            }
            
            // Construit l'URL absolue pour l'image (nécessaire pour OG)
            // Utilise la variable d'environnement de Render ou localhost par défaut
            const siteBaseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`; 
            let absoluteOgImage = `${siteBaseUrl}/default-banner.png`;
            if (ogImage) {
                absoluteOgImage = ogImage.startsWith('http') ? ogImage : `${siteBaseUrl}${ogImage}`;
            }
            // --- FIN LOGIQUE SEO ---

            // --- NETTOYAGE DU CONTENU (Enlever le titre H1) ---
            let finalContent = article.content || '';
            // Enlève la première ligne si elle commence par # (Titre H1)
            finalContent = finalContent.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();

            // --- PARSING MARKDOWN ---
            try {
                article.content = marked.parse(finalContent);
            } catch (parseError) {
                console.error(`Erreur parsing Markdown article ${id}:`, parseError);
                article.content = "<p style='color:red;'>Erreur rendu Markdown.</p>";
            }

            // Envoie toutes les données à la vue
            res.render('entry_detail', {
                article: article,
                pageTitle: article.title,
                activePage: 'journal',
                prevEntry: prevEntry || null,
                nextEntry: nextEntry || null,
                comments: comments || [],
                // Pour le feedback du formulaire de commentaire
                messageSent: req.query.comment === 'success' ? true : (req.query.comment === 'error' ? false : null),
                
                // Variables OG pour le header
                ogTitle: article.title,
                ogDescription: ogDescription,
                ogImage: absoluteOgImage,
                ogType: 'article'
            });

        }).catch(promiseErr => {
            console.error(`Erreur BDD (GET /entree/${id} tags/prev/next/comments):`, promiseErr);
            res.status(500).send("Erreur serveur lors de la récupération des données.");
        });
    });
});
app.get('/tags/:tagName', (req, res) => {
    const tagName = req.params.tagName;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;

    const message = req.session.flashMessage;
    req.session.flashMessage = null;

    const sqlFindTag = `SELECT id FROM tags WHERE name_${lang} = ?`;
    
    db.get(sqlFindTag, [tagName], (errTag, tag) => {
        if (errTag) { console.error(`Erreur BDD (GET /tags/${tagName} findTag):`, errTag); return res.status(500).send("Erreur serveur."); }
        if (!tag) {
            return res.render('journal', { 
                articles: [], pageTitle: `Tag introuvable : "${tagName}"`, activePage: 'journal', 
                currentPage: 1, totalPages: 0, currentTag: tagName, message: message 
            });
        }
        
        const tagId = tag.id;
        const sqlEntries = `
            SELECT
                a.id, a.title_${lang} as title, a.summary_${lang} as summary, a.content_${lang} as content,
                a.cover_image_url, a.publication_date,
                GROUP_CONCAT(t.name_${lang}) as tags
            FROM articles a
            JOIN article_tags at ON a.id = at.article_id
            LEFT JOIN article_tags at_all ON a.id = at_all.article_id
            LEFT JOIN tags t ON at_all.tag_id = t.id
            WHERE at.tag_id = ?
            GROUP BY a.id
            ORDER BY a.publication_date DESC
            LIMIT ? OFFSET ?
        `;
        const sqlCount = `SELECT COUNT(*) as totalCount FROM article_tags WHERE tag_id = ?`;
        
        db.all(sqlEntries, [tagId, ITEMS_PER_PAGE, offset], (err, rows) => {
            if (err) { console.error(`Erreur BDD (GET /tags/${tagName} entries):`, err); return res.status(500).send("Erreur serveur."); }
            
            db.get(sqlCount, [tagId], (errCount, countResult) => {
                if (errCount) { console.error(`Erreur BDD (GET /tags/${tagName} count):`, errCount); return res.status(500).send("Erreur serveur."); }
                 
                const totalEntries = countResult.totalCount;
                const totalPages = Math.ceil(totalEntries / ITEMS_PER_PAGE);
                 
                const articlesWithData = rows.map(article => {
                    const tagList = article.tags ? article.tags.split(',') : [];
                     
                    let finalCoverImage = article.cover_image_url;
                    if (!finalCoverImage) {
                        const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                        finalCoverImage = match ? match[1] : null;
                    }
                     
                    let excerpt = "";

                    if (article.summary) {
                        excerpt = article.summary;
                    }
                    else {
                        let textContent = article.content.replace(/!\[.*?\]\(.*?\)/g, '');
                        textContent = textContent.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                        const plainContent = textContent.replace(/[#*`~_]|(\[.*?\]\(.*?\))/g, '');
                        excerpt = plainContent.substring(0, 350) + "..."; // Coupe et ajoute "..."
                    }
                    
                    return { 
                        ...article, 
                        tags: tagList, 
                        coverImage: finalCoverImage, 
                        excerpt: plainContent.substring(0, 350) 
                    };
                });
                 
                res.render('journal', {
                    articles: articlesWithData,
                    pageTitle: `Tag : "${tagName}"`,
                    activePage: 'journal',
                    currentPage: currentPage,
                    totalPages: totalPages,
                    currentTag: tagName,
                    message: message,
                    currentSort: null // Pas de tri sur cette page pour l'instant
                });
            });
        });
    });
});

// Recherche
app.get('/search', (req, res) => {
    const query = req.query.query || '';
    const tagId = parseInt(req.query.tag) || null;
    const sortOption = req.query.sort || 'date_desc';
    const lang = req.language === 'en' ? 'en' : 'fr';
    const message = req.session.flashMessage;
    req.session.flashMessage = null;

    // 1. Récupérer TOUS les tags pour le menu déroulant
    const sqlAllTags = `SELECT id, name_${lang} as name FROM tags ORDER BY name_${lang} ASC`;

    db.all(sqlAllTags, [], (errTags, allTags) => {
        if (errTags) { console.error("Erreur BDD (GET /search tags):", errTags); return res.status(500).send("Erreur serveur."); }

        // Si aucun filtre, page vide
        if (!query && !tagId) {
            return res.render('search_results', {
                articles: [], query: '', currentTagId: null, currentSort: sortOption,
                allTags: allTags, pageTitle: req.t('page_titles.search'), activePage: 'search', message: message
            });
        }

        // 2. Construction de la requête SQL
        let sqlParams = [];
        let whereClauses = [];

        if (query) {
            whereClauses.push('(a.title_fr LIKE ? OR a.title_en LIKE ? OR a.content_fr LIKE ? OR a.content_en LIKE ?)');
            const searchTerm = `%${query}%`;
            sqlParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        if (tagId) {
            // Jointure spécifique pour le filtre
            whereClauses.push('at_filter.tag_id = ?');
            sqlParams.push(tagId);
        }

        let sortClause = 'ORDER BY a.publication_date DESC';
        switch (sortOption) {
            case 'date_asc': sortClause = 'ORDER BY a.publication_date ASC'; break;
            case 'alpha_asc': sortClause = `ORDER BY title_${lang} ASC`; break;
            case 'alpha_desc': sortClause = `ORDER BY title_${lang} DESC`; break;
        }

        const sql = `
            SELECT
                a.id, a.title_${lang} as title, a.summary_${lang} as summary, a.content_${lang} as content,
                a.cover_image_url, a.publication_date,
                GROUP_CONCAT(DISTINCT t.name_${lang}) as tags
            FROM articles a
            LEFT JOIN article_tags at_display ON a.id = at_display.article_id
            LEFT JOIN tags t ON at_display.tag_id = t.id
            ${tagId ? 'JOIN article_tags at_filter ON a.id = at_filter.article_id' : ''}
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY a.id
            ${sortClause}
        `;

        db.all(sql, sqlParams, (err, rows) => {
            if (err) { console.error("Erreur BDD (GET /search execute):", err); return res.status(500).send("Erreur serveur."); }

            const articlesWithData = rows.map(article => {
                const tagList = article.tags ? article.tags.split(',') : [];
                
                let finalCoverImage = article.cover_image_url;
                if (!finalCoverImage) {
                    const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                    finalCoverImage = match ? match[1] : null;
                }

                let excerpt = "";

                if (article.summary) {
                    excerpt = article.summary;
                }
                else {
                    let textContent = article.content.replace(/!\[.*?\]\(.*?\)/g, ''); // Enlève images
                    textContent = textContent.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim(); // Enlève titre H1
                    const plainContent = textContent.replace(/[#*`~_]|(\[.*?\]\(.*?\))/g, ''); // Enlève markdown
                    excerpt = plainContent.substring(0, 350) + "..."; // Coupe et ajoute "..."
                }

                return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: excerpt };
            });

            res.render('search_results', {
                articles: articlesWithData,
                query: query,
                currentTagId: tagId,
                currentSort: sortOption,
                allTags: allTags,
                pageTitle: `${req.t('search.results_for')}...`,
                activePage: 'search',
                message: message
            });
        });
    });
});

// Contact
app.get('/contact', (req, res) => {
    res.render('contact', {
        pageTitle: req.t('page_titles.contact'),
        activePage: 'contact',
        messageSent: null,
        ogTitle: req.t('page_titles.contact'),
        ogDescription: req.t('contact.intro'),
        ogImage: null
    });
});
app.post('/contact', contactLimiter, (req, res) => {
    // 1. Vérification Honeypot
    if (req.body.website_field && req.body.website_field !== '') {
        console.warn("Honeypot (contact) déclenché ! Rejet silencieux.");
        return res.render('contact', { pageTitle: req.t('page_titles.contact'), activePage: 'contact', messageSent: true }); // Faux succès
    }
    // 2. Vérification Nodemailer
    if (!transporter) { return res.status(503).render('contact', { /* ... error: 'Service email non dispo' ... */ }); }
    // 3. Validation champs
    const { name, email, message } = req.body;
    if (!name || !email || !message || !email.includes('@')) { return res.status(400).render('contact', { /* ... error: 'Champs invalides' ... */ }); }
    // 4. Préparation email
    const mailOptions = { /* ... (détails email) ... */ };
    // 5. Envoi email
    transporter.sendMail(mailOptions, (error, info) => {
        let messageStatus = null;
        if (error) { console.error("Erreur envoi email:", error); messageStatus = false; }
        else { console.log('Email contact envoyé: ' + info.response); messageStatus = true; }
        res.render('contact', { pageTitle: req.t('page_titles.contact'), activePage: 'contact', messageSent: messageStatus, error: !messageStatus ? req.t('contact.error_message') : null });
    });
});

// SEO
app.get('/sitemap.xml', async (req, res) => {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
    try {
        const staticLinks = [ /* ... (liens statiques) ... */ ];
        const sql = 'SELECT id, publication_date FROM articles ORDER BY publication_date DESC';
        const entries = await new Promise((resolve, reject) => {
            db.all(sql, [], (err, rows) => err ? reject(err) : resolve(rows));
        });
        const dynamicLinks = entries.map(entry => ({ /* ... */ }));
        const allLinks = staticLinks.concat(dynamicLinks);
        const stream = new SitemapStream({ hostname: baseUrl });
        const xml = await streamToPromise(Readable.from(allLinks).pipe(stream));
        res.header('Content-Type', 'application/xml');
        res.send(xml.toString());
    } catch (error) {
        console.error("Erreur génération sitemap:", error);
        res.status(500).send("Erreur génération sitemap.");
    }
});

// --- Authentification & Sécurité ---

// Connexion (avec logique 2FA et Onboarding)
app.get('/connexion', (req, res) => {
    const resetSuccess = req.query.reset === 'success';
    const message = req.session.flashMessage; // Lit le message flash (ex: "Compte créé")
    req.session.flashMessage = null;
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) { console.error("Erreur BDD (GET /connexion count):", err); return res.status(500).send("Erreur serveur."); }
        res.render('login', {
            pageTitle: req.t('page_titles.login'),
            error: null, // L'erreur est gérée par la route POST
            adminExists: row.count > 0,
            activePage: 'admin',
            resetSuccess: resetSuccess,
            message: message // Passe le message flash
        });
    });
});
app.post('/connexion', authLimiter, (req, res) => {
    const { username, password } = req.body;

    // 1. On cherche l'utilisateur
    const sql = 'SELECT * FROM users WHERE username = ?';

    db.get(sql, [username], (err, user) => {
        if (err) {
            console.error("Erreur BDD (POST /connexion):", err);
            // En cas d'erreur technique, on affiche une erreur générique sur la page de login
            return res.render('login', { 
                pageTitle: req.t('page_titles.login'), 
                error: "Erreur serveur lors de la connexion.", 
                adminExists: true, activePage: 'admin', resetSuccess: false, message: null 
            });
        }

        // 2. Utilisateur introuvable
        if (!user) { 
            return res.render('login', { 
                pageTitle: req.t('page_titles.login'), 
                error: "Nom d'utilisateur ou mot de passe incorrect.", 
                adminExists: true, activePage: 'admin', resetSuccess: false, message: null 
            }); 
        }

        // 3. Vérification du mot de passe
        bcrypt.compare(password, user.password, (errCompare, result) => {
            if (errCompare) { 
                console.error("Erreur bcrypt:", errCompare);
                return res.render('login', { /* ... erreur technique ... */ }); 
            }

            // --- SUCCÈS : MOT DE PASSE CORRECT ---
            if (result) {
                // ============================================================
                // CAS 1 : La 2FA est ACTIVÉE (Priorité Absolue)
                // ============================================================
                if (user.two_fa_enabled === 1) {
                    console.log(`Connexion 2FA requise pour ${user.username}`);

                    // On ne connecte PAS encore complètement (pas de userId dans la session)
                    // On stocke juste l'ID temporaire pour la page de vérification
                    req.session.tempUserId = user.id;

                    // On sauvegarde et on redirige vers le formulaire du CODE
                    return req.session.save((errSave) => {
                        if (errSave) console.error("Erreur save session 2FA:", errSave);
                        res.redirect('/connexion/2fa');
                    });
                }

                // ============================================================
                // Si on arrive ici, c'est que la 2FA n'est PAS active.
                // On peut donc connecter l'utilisateur.
                // ============================================================

                req.session.userId = user.id;
                req.session.username = user.username;

                logAction(req, 'LOGIN', 'Connexion réussie');

                // ============================================================
                // CAS 2 : ONBOARDING (Jamais demandé d'activer la 2FA)
                // ============================================================
                if (user.two_fa_prompted === 0) {
                    console.log(`Premier login (ou reset) pour ${user.username} -> Onboarding 2FA`);

                    // On redirige vers la page de proposition "Voulez-vous sécuriser ?"
                    return req.session.save((errSave) => {
                        if (errSave) console.error("Erreur save session onboarding:", errSave);
                        res.redirect('/admin/2fa/choice');
                    });
                }

                // ============================================================
                // CAS 3 : CONNEXION STANDARD (Classique)
                // ============================================================
                console.log(`Connexion standard réussie pour ${user.username}`);

                req.session.flashMessage = { type: 'success', text: `Bonjour, ${user.username} !` };

                req.session.save((errSave) => {
                    if (errSave) console.error("Erreur save session standard:", errSave);
                    res.redirect('/');
                });
            } else {
                // --- ÉCHEC : MOT DE PASSE INCORRECT ---
                logAction(req, 'LOGIN_FAILED', `Tentative échouée pour: ${username}`);
                res.render('login', { 
                    pageTitle: req.t('page_titles.login'), 
                    error: "Nom d'utilisateur ou mot de passe incorrect.", 
                    adminExists: true, activePage: 'admin', resetSuccess: false, message: null 
                });
            }
        });
    });
});

// Inscription (Admin unique)
app.get('/inscription', checkAdminExists, (req, res) => { res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: null }); });
app.post('/inscription', checkAdminExists, authLimiter, (req, res) => {
    const { username, password, email } = req.body;
    if (!email || !email.includes('@')) { return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: 'Adresse email invalide.' }); }
    if (!password || password.length < 8) { return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: 'Le mot de passe doit faire au moins 8 caractères.' }); }
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (errHash, hash) => {
        if (errHash) { console.error("Erreur hachage (inscription):", errHash); return res.status(500).send("Erreur serveur."); }
        const sql = 'INSERT INTO users (username, password, email) VALUES (?, ?, ?)';
        db.run(sql, [username, hash, email], function(errInsert) {
            if (errInsert) {
                let errorMessage = "Erreur création compte.";
                return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: errorMessage + (errInsert.message ? ` (${errInsert.message})` : '') });
            }
            req.session.flashMessage = { type: 'success', text: 'Compte administrateur créé ! Vous pouvez vous connecter.' }; // Message de succès
            res.redirect('/connexion');
        });
    });
});

// Déconnexion
app.get('/deconnexion', (req, res) => {
    req.session.destroy(err => {
        if (err) { console.error("Erreur déconnexion:", err); return res.redirect('/'); }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Mot de passe oublié
app.get('/forgot-password', (req, res) => { res.render('forgot-password', { pageTitle: 'Mot de Passe Oublié', activePage: 'admin', error: null, info: null }); });
app.post('/forgot-password', authLimiter, async (req, res) => {
    const email = req.body.email;
    if (!email) { return res.render('forgot-password', { /* ... error: 'Email requis' ... */ }); }
    if (!transporter) { return res.render('forgot-password', { /* ... error: 'Service email non configuré' ... */ }); }
    const sqlFindUser = 'SELECT * FROM users WHERE email = ?';
    db.get(sqlFindUser, [email], async (err, user) => {
        const infoMsg = 'Si un compte avec cet email existe, un lien de réinitialisation a été envoyé.';
        if (err) { console.error("Erreur BDD (POST /forgot-password findUser):", err); }
        if (!err && user) {
            const token = crypto.randomBytes(32).toString('hex');
            const expires = Date.now() + 3600000; // 1 heure
            const sqlUpdateToken = 'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?';
            db.run(sqlUpdateToken, [token, expires, user.id], (errUpdate) => {
                if (errUpdate) { /* ... gestion erreur ... */ }
                const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${token}`;
                const mailOptions = { /* ... (détails email) ... */ text: `Cliquez ici: ${resetLink} (expire dans 1h)` };
                transporter.sendMail(mailOptions, (errMail) => {
                    if (errMail) { /* ... gestion erreur ... */ }
                    res.render('forgot-password', { /* ... info: infoMsg ... */ });
                });
            });
        } else { res.render('forgot-password', { /* ... info: infoMsg ... */ }); }
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
app.post('/reset-password/:token', authLimiter, (req, res) => {
    const token = req.params.token;
    const { newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword || newPassword.length < 8) { return res.render('reset-password', { /* ... error: 'Mots de passe invalides' ... */ }); }
    const sqlFindToken = 'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?';
    db.get(sqlFindToken, [token, Date.now()], (err, user) => {
        if (err || !user) { return res.render('forgot-password', { /* ... error: 'Lien invalide ou expiré.' ... */ }); }
        const saltRounds = 10;
        bcrypt.hash(newPassword, saltRounds, (errHash, newHash) => {
            if (errHash) { return res.render('reset-password', { /* ... error: 'Erreur hachage.' ... */ }); }
            const sqlUpdatePass = 'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?';
            db.run(sqlUpdatePass, [newHash, user.id], (errUpdate) => {
                if (errUpdate) { return res.render('reset-password', { /* ... error: 'Erreur mise à jour.' ... */ }); }
                res.redirect('/connexion?reset=success');
            });
        });
    });
});

// Vérification 2FA (lors du login)
app.get('/connexion/2fa', (req, res) => {
    if (!req.session.tempUserId) return res.redirect('/connexion'); // Sécurité
    res.render('login-2fa', { pageTitle: 'Vérification 2FA', activePage: 'admin', error: null });
});
app.post('/connexion/2fa', authLimiter, (req, res) => {
    const { token } = req.body;
    const userId = req.session.tempUserId; // ID temporaire stocké à l'étape précédente

    if (!userId) return res.redirect('/connexion');

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        const verified = speakeasy.totp.verify({
            secret: user.two_fa_secret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            // SUCCÈS !
            req.session.userId = user.id;
            req.session.username = user.username;
            delete req.session.tempUserId;

            req.session.flashMessage = { type: 'success', text: `Connexion sécurisée réussie !` };
            // SAUVEGARDE AVANT REDIRECTION (Très important ici)
            req.session.save(() => res.redirect('/'));
        } else {
            // ERREUR : On ré-affiche la page avec l'erreur
            // Ici on n'utilise pas flashMessage car on ne redirige pas, on fait un render
            res.render('login-2fa', {
                pageTitle: 'Vérification 2FA',
                activePage: 'admin',
                error: 'Code incorrect.'
            });
        }
    });
});

// --- Administration (Tableau de bord & Outils) ---

// Redirection racine
app.get('/admin', isAuthenticated, (req, res) => {
    res.redirect('/admin/dashboard');
});

// Tableau de bord (Stats)
app.get('/admin/dashboard', isAuthenticated, (req, res) => {
    
    // 1. Stats par SEMAINE (Numéro de semaine)
    const sqlWeekly = `
        SELECT strftime('%Y-W%W', publication_date) as period, COUNT(*) as count
        FROM articles
        GROUP BY period
        ORDER BY period ASC
    `;

    // 2. Stats par MOIS (Année-Mois)
    const sqlMonthly = `
        SELECT strftime('%Y-%m', publication_date) as period, COUNT(*) as count
        FROM articles
        GROUP BY period
        ORDER BY period ASC
    `;

    // 3. Stats par TAG (Pour le dashboard final/global)
    const sqlTags = `
        SELECT t.name_fr as label, COUNT(at.article_id) as count 
        FROM tags t 
        JOIN article_tags at ON t.id = at.tag_id 
        GROUP BY t.id
    `;

    // 4. Stats GLOBALES (Totaux)
    const sqlGlobal = `
        SELECT 
            COUNT(*) as totalEntries,
            (SELECT COUNT(*) FROM comments) as totalComments,
            (SELECT COUNT(*) FROM tags) as totalTags
        FROM articles
    `;

    Promise.all([
        new Promise((resolve, reject) => db.all(sqlWeekly, [], (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.all(sqlMonthly, [], (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.all(sqlTags, [], (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.get(sqlGlobal, [], (err, row) => err ? reject(err) : resolve(row)))
    ]).then(([weeklyData, monthlyData, tagData, globalData]) => {
        
        res.render('dashboard', {
            pageTitle: "Tableau de Bord",
            activePage: 'admin',
            weeklyData,
            monthlyData,
            tagData,
            globalData
        });

    }).catch(err => {
        console.error("Erreur Dashboard:", err);
        res.status(500).send("Erreur lors de la génération du tableau de bord.");
    });
});

// Gestion des Tags
app.get('/admin/tags', isAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM tags ORDER BY name_fr ASC';
    db.all(sql, [], (err, tags) => {
        if (err) {
            console.error("Erreur BDD (GET /admin/tags):", err);
            return res.status(500).send("Erreur serveur.");
        }
        const message = req.session.flashMessage;
        req.session.flashMessage = null;
        res.render('admin-tags', {
            pageTitle: req.t('admin_page.manage_tags_title'),
            activePage: 'admin',
            tags: tags,
            message: message
        });
    });
});
app.post('/admin/tags/create', isAuthenticated, async (req, res) => {
    const name_fr = req.body.name_fr; // On récupère seulement le nom FR

    // On ne vérifie que name_fr
    if (!name_fr || name_fr.trim() === '') {
        req.session.flashMessage = { type: 'error', text: 'Le nom français est requis.' };
        return res.redirect('/admin/tags');
    }

    let name_en = name_fr.trim(); // Valeur par défaut si la traduction échoue
    const name_fr_trimmed = name_fr.trim();

    // --- Traduction via DeepL ---
    // Vérifie si le client DeepL (translator) est initialisé ET que la clé API existe
    if (translator) {
        try {
            console.log(`[Tag Create] Traduction de "${name_fr_trimmed}" vers EN...`);
            const result = await translator.translateText(name_fr_trimmed, 'fr', 'en-GB');
            if (result && typeof result.text === 'string') {
                name_en = result.text; // Utilise la traduction
                console.log(`[Tag Create] Traduction réussie: "${name_en}"`);
            } else {
                console.warn("[Tag Create] Réponse DeepL invalide pour la traduction du tag.");
            }
        } catch (error) {
            console.error("[Tag Create] Erreur lors de la traduction DeepL:", error);
            // Si erreur, name_en garde la valeur de name_fr (fallback)
        }
    } else {
        console.warn("[Tag Create] Client DeepL non initialisé, utilise le nom FR pour EN.");
    }

    // Insertion dans la base de données avec les deux noms
    const sql = 'INSERT INTO tags (name_fr, name_en) VALUES (?, ?)';
    db.run(sql, [name_fr_trimmed, name_en], function(err) {
        let message;
        if (err) {
            console.error("Erreur BDD (POST /admin/tags/create):", err);
            // Gère l'erreur si un nom existe déjà (contrainte UNIQUE)
            if (err.message.includes('UNIQUE constraint failed')) {
                message = { type: 'error', text: 'Un tag avec ce nom (FR ou EN) existe déjà.' };
            } else {
                message = { type: 'error', text: 'Erreur lors de la création du tag.' };
            }
        } else {
            message = { type: 'success', text: `Tag "${name_fr_trimmed}" / "${name_en}" créé avec succès.` };
        }
        req.session.flashMessage = message;
        res.redirect('/admin/tags');
    })
});
app.post('/admin/tags/update/:id', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const { name_en } = req.body; // On récupère le nouveau nom anglais envoyé par le formulaire

    if (!name_en || name_en.trim() === '') {
        req.session.flashMessage = { type: 'error', text: 'Le nom anglais ne peut pas être vide.' };
        return res.redirect('/admin/tags');
    }

    const sql = 'UPDATE tags SET name_en = ? WHERE id = ?';

    db.run(sql, [name_en, id], function(err) {
        if (err) {
            console.error(`Erreur BDD (POST /admin/tags/update/${id}):`, err);
            req.session.flashMessage = { type: 'error', text: 'Erreur lors de la mise à jour du tag.' };
        } else {
            req.session.flashMessage = { type: 'success', text: `Tag #${id} mis à jour avec succès.` };
        }
        res.redirect('/admin/tags');
    })
})
app.post('/admin/tags/delete/:id', isAuthenticated, (req, res) => {
    const tagId = req.params.id;
    const sql = 'DELETE FROM tags WHERE id = ?';

    db.run(sql, [tagId], function(err) {
        let message;
        if (err) {
            console.error(`Erreur BDD (POST /admin/tags/delete/${tagId}):`, err);
            message = { 
                 type: 'error', 
                 text: 'Erreur lors de la suppression du tag.', 
                 detail: err.message // <-- AJOUT
             };
        } else {
            message = { type: 'success', text: `Tag #${tagId} supprimé.` };
        }
        req.session.flashMessage = message;
        res.redirect('/admin/tags');
    })
});

// Gestion des Commentaires (Historique & Suppression)
app.get('/admin/comments', isAuthenticated, (req, res) => {
    const sql = `
        SELECT c.id, c.author_name, c.content, c.created_at, a.title_fr as article_title, a.id as article_id 
        FROM comments c 
        JOIN articles a ON c.article_id = a.id 
        ORDER BY c.created_at DESC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Erreur BDD (GET /admin/comments):", err);
            return res.status(500).send("Erreur serveur.");
        }

        const message = req.session.flashMessage;
        req.session.flashMessage = null;

        res.render('admin-comments', {
            pageTitle: req.t('admin_page.manage_comments_title'),
            activePage: 'admin',
            comments: rows, // Une seule liste
            message: message
        });
    });
});
app.post('/admin/comments/delete/:id', isAuthenticated, (req, res) => {
    const commentId = req.params.id;
    const sql = 'DELETE FROM comments WHERE id = ?';
    db.run(sql, [commentId], function(err) {
        if (err) { 
            req.session.flashMessage = { 
                type: 'error', 
                text: 'Erreur suppression.',
                detail: err.message};
            } else { req.session.flashMessage = { type: 'success', text: `Commentaire #${commentId} supprimé.` }; }
            res.redirect('/admin/comments');
    });
});

// Compte Admin
app.get('/change-password', isAuthenticated, (req, res) => { res.render('change-password', { pageTitle: 'Changer Mot de Passe', activePage: 'admin', error: null, success: null }); });
app.post('/change-password', isAuthenticated, authLimiter, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.userId;
    const pageTitle = "Changer le Mot de Passe"; // Fallback title
    const activePage = "admin";

    // Vérifie si les nouveaux mots de passe correspondent
    if (newPassword !== confirmPassword) {
        return res.render('change-password', {
            pageTitle: pageTitle, activePage: activePage,
            error: 'Les nouveaux mots de passe ne correspondent pas.', success: null
        });
    }

    // Ajout d'une vérification de longueur minimale
    if (newPassword.length < 8) {
         return res.render('change-password', {
             pageTitle: pageTitle, activePage: activePage,
             error: 'Le nouveau mot de passe doit faire au moins 8 caractères.', success: null
         });
     }

     // Récupère l'utilisateur actuel pour vérifier son mot de passe
     const sqlGetUser = 'SELECT * FROM users WHERE id = ?';
     db.get(sqlGetUser, [userId], (err, user) => {
        if (err || !user) {
            return res.render('change-password', {
                pageTitle: pageTitle, activePage: activePage,
                error: 'Utilisateur non trouvé ou erreur serveur.', success: null
            });
        }

        // Compare le mot de passe actuel fourni avec celui haché dans la BDD
        bcrypt.compare(currentPassword, user.password, (errCompare, result) => {
            if (errCompare || !result) {
                return res.render('change-password', {
                    pageTitle: pageTitle, activePage: activePage,
                    error: 'Le mot de passe actuel est incorrect.', success: null
                });
            }

            // Si le mot de passe actuel est correct, on hache le nouveau
            const saltRounds = 10;
            bcrypt.hash(newPassword, saltRounds, (errHash, newHash) => {
                if (errHash) {
                    return res.render('change-password', {
                        pageTitle: pageTitle, activePage: activePage,
                        error: 'Erreur lors du hachage du nouveau mot de passe.', success: null
                    });
                }

                // Met à jour le mot de passe dans la base de données
                const sqlUpdatePass = 'UPDATE users SET password = ? WHERE id = ?';
                db.run(sqlUpdatePass, [newHash, userId], (errUpdate) => {
                    if (errUpdate) {
                        return res.render('change-password', {
                            pageTitle: pageTitle, 
                            activePage: activePage,
                            error: 'Erreur lors de la mise à jour du mot de passe.',
                            deatil: errUpdate.message,
                            success: null
                        });
                    }

                    // Succès ! On affiche un message
                    res.render('change-password', {
                        pageTitle: pageTitle, activePage: activePage,
                        error: null, success: 'Mot de passe mis à jour avec succès !'
                    });
                });
            });
        });
     });
});

// Journal d'Audit (Logs de sécurité)
app.get('/admin/audit', isAuthenticated, (req, res) => {
    // On récupère les 100 derniers logs
    const sql = `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`;
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).send("Erreur BDD");
        
        res.render('admin-audit', {
            pageTitle: "Journal d'Audit",
            activePage: 'admin',
            logs: rows
        });
    });
});

// Outils de Sauvegarde & Export
app.get('/admin/backup', isAuthenticated, (req, res) => {
    const dbFile = path.join(__dirname, 'blog.db');
    const date = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    const filename = `backup-blog-${date}.db`;

    res.download(dbFile, filename, (err) => {
        if (err) {
            console.error("Erreur lors du téléchargement du backup:", err);
            // Si le téléchargement échoue (ex: fichier introuvable), on essaie d'afficher une erreur
            if (!res.headersSent) {
                res.status(500).send("Erreur : Impossible de télécharger la base de données.");
            }
        }
    });
});
app.get('/admin/export/pdf', isAuthenticated, async (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';

    // 1. Récupérer TOUS les articles (du plus vieux au plus récent pour lire l'histoire)
    const sql = `
        SELECT 
            a.title_${lang} as title, 
            a.content_${lang} as content, 
            a.publication_date, 
            GROUP_CONCAT(t.name_${lang}) as tags
        FROM articles a
        LEFT JOIN article_tags at ON a.id = at.article_id
        LEFT JOIN tags t ON at.tag_id = t.id
        GROUP BY a.id
        ORDER BY a.publication_date ASC
    `;

    db.all(sql, [], async (err, rows) => {
        if (err) return res.status(500).send("Erreur BDD");

        try {
            const articlesProcessed = rows.map(art => {
                let cleanContent = art.content.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim(); // Enlève titre H1
                return {
                    ...art,
                    content: marked.parse(cleanContent)
                };
            });

            // On génère le HTML complet
            const htmlContent = await new Promise((resolve, reject) => {
                app.render('pdf-export', {
                    articles: articlesProcessed,
                    author: req.session.username
                }, (err, html) => {
                    if (err) reject(err);
                    else resolve(html);
                });
            });

            // 3. Lancer Puppeteer pour créer le PDF
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox'] // Nécessaire pour certains environnements serveurs
            });
            const page = await browser.newPage();

            // On définit le contenu et on attend que les images soient chargées
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }
            });

            await browser.close();

            // 4. Envoyer le fichier
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="carnet-de-stage.pdf"',
                'Content-Length': pdfBuffer.length
            });
            res.send(pdfBuffer);
        } catch (pdfError) {
            console.error("Erreur génération PDF:", pdfError);
            res.status(500).send("Erreur lors de la génération du PDF.");
        }
    });
});

// --- Configuration 2FA (Double Authentification) ---

// Onboarding (Choix initial)
app.get('/admin/2fa/choice', isAuthenticated, (req, res) => {
    res.render('admin-2fa-choice', {
        pageTitle: 'Sécuriser votre compte',
        activePage: 'admin'
    });
});
app.post('/admin/2fa/accept', isAuthenticated, (req, res) => {
    res.redirect('/admin/2fa/setup-start'); // On va créer cette petite route helper juste après
});
app.post('/admin/2fa/skip', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    // On note qu'on a posé la question (prompted = 1)
    db.run('UPDATE users SET two_fa_prompted = 1 WHERE id = ?', [userId], (err) => {
        req.session.flashMessage = { type: 'info', text: 'Vous pourrez activer la 2FA plus tard dans l\'administration.' };
        res.redirect('/');
    });
});

// Configuration & Activation
app.get('/admin/2fa', isAuthenticated, (req, res) => {
    const userId = req.session.userId;

    db.get('SELECT two_fa_enabled FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).send('Erreur BDD');

        res.render('admin-2fa', { 
            pageTitle: 'Sécurité 2FA', 
            activePage: 'admin', 
            step: user.two_fa_enabled ? 'enabled' : 'disabled', // 'enabled' ou 'disabled'
            qrCodeUrl: null, 
            secret: null 
        });
    });
});
app.get('/admin/2fa/setup-start', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const secret = speakeasy.generateSecret({ name: "Carnet de Stage (" + req.session.username + ")" });

    db.run('UPDATE users SET two_fa_secret = ?, two_fa_prompted = 1 WHERE id = ?', [secret.base32, userId], (err) => {
        if (err) {
            console.error("Erreur setup 2FA:", err);
            return res.status(500).send('Erreur serveur');
        }

        QRCode.toDataURL(secret.otpauth_url, (errQR, data_url) => {
            res.render('admin-2fa', { 
                pageTitle: 'Configuration 2FA', 
                activePage: 'admin', 
                step: 'setup',
                qrCodeUrl: data_url, 
                secret: secret.base32 
            });
        });
    });
});
app.post('/admin/2fa/setup', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const secret = speakeasy.generateSecret({ name: "Carnet de Stage (" + req.session.username + ")" });

    // On sauvegarde le secret mais ON NE L'ACTIVE PAS ENCORE (enabled = 0)
    db.run('UPDATE users SET two_fa_secret = ? WHERE id = ?', [secret.base32, userId], (err) => {
        if (err) return res.status(500).send('Erreur sauvegarde secret');

        QRCode.toDataURL(secret.otpauth_url, (errQR, data_url) => {
            // On affiche la page en mode "setup"
            res.render('admin-2fa', { 
                pageTitle: 'Configuration 2FA', 
                activePage: 'admin',
                step: 'setup', // Mode configuration
                qrCodeUrl: data_url, 
                secret: secret.base32 
            });
        });
    });
});
app.post('/admin/2fa/enable', isAuthenticated, (req, res) => {
    const { token } = req.body;
    const userId = req.session.userId;

    db.get('SELECT two_fa_secret FROM users WHERE id = ?', [userId], (err, user) => {
        const verified = speakeasy.totp.verify({
            secret: user.two_fa_secret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            // Le code est bon, on active pour de bon
            db.run('UPDATE users SET two_fa_enabled = 1 WHERE id = ?', [userId], (err) => {
                req.session.flashMessage = { type: 'success', text: 'Double authentification activée avec succès !' };
                
                // --- MODIFICATION ICI ---
                // On sauvegarde la session et on redirige vers l'ACCUEIL au lieu de /admin/2fa
                req.session.save(() => res.redirect('/'));
                // ------------------------
            });
        } else {
            req.session.flashMessage = { type: 'error', text: 'Code incorrect. Recommencez la configuration.' };
            // En cas d'erreur, on reste sur la page de config pour qu'il puisse réessayer
            req.session.save(() => res.redirect('/admin/2fa'));
        }
    });
});
app.post('/admin/2fa/disable', isAuthenticated, (req, res) => {
    db.run('UPDATE users SET two_fa_enabled = 0, two_fa_secret = NULL WHERE id = ?', [req.session.userId], (err) => {
        req.session.flashMessage = { type: 'success', text: 'Double authentification désactivée.' };
        // SAUVEGARDE AVANT REDIRECTION
        req.session.save(() => res.redirect('/admin/2fa'));
    });
});

// --- Gestion du Contenu (Création / Modif / Suppression) ---

// Création
app.get('/journal/nouvelle', isAuthenticated, (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sqlTags = `SELECT id, name_${lang} as name FROM tags ORDER BY name_${lang} ASC`;
    db.all(sqlTags, [], (err, allTags) => {
        if (err) { allTags = []; console.error("Erreur BDD (GET /journal/nouvelle tags):", err); }
        res.render('new_entry', {
            pageTitle: req.t('page_titles.new_entry'), 
            activePage: 'journal',
            allTags: allTags, 
            articleTags: []
        });
    });
});
app.post('/journal', isAuthenticated, async (req, res) => {
    const { title_fr, title_en, summary_fr, content_fr, content_en, cover_image_url, tags } = req.body;
    let summary_en = req.body.summary_en; // On prend la valeur du formulaire
    const userId = req.session.userId;

    // --- Gestion des Tags (Tableau d'IDs) ---
    let tagIds = tags;
    if (tagIds === undefined) { tagIds = []; }
    else if (!Array.isArray(tagIds)) { tagIds = [tagIds]; }
    tagIds = tagIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

    if (summary_fr && !summary_en && translator) {
        try {
            console.log("Traduction automatique du résumé...");
            const result = await translator.translateText(summary_fr, 'fr', 'en-GB');
            if (result && typeof result.text === 'string') {
                summary_en = result.text;
            }
        } catch (error) {
            console.error("Erreur traduction résumé :", error);
        }
    }
    
    const sqlInsertArticle = 'INSERT INTO articles (title_fr, title_en, summary_fr, summary_en, content_fr, content_en, user_id, cover_image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    
    db.run(sqlInsertArticle, [title_fr, title_en, summary_fr, summary_en, content_fr, content_en, userId, cover_image_url], async function(err) {
        if (err) {
            console.error("Erreur BDD (POST /journal insert):", err);
            req.session.flashMessage = {
                type: 'error',
                text: 'Erreur lors de la création de l\'entrée.',
                detail: err.message
            };
            return res.redirect('/journal');
        }
        
        const articleId = this.lastID;

        logAction(req, 'CREATE_ARTICLE', `Titre: ${title_fr} (ID: ${articleId})`);

        try {
            await processTags(articleId, tagIds);
            req.session.flashMessage = { type: 'success', text: 'Entrée créée avec succès !' };

            req.session.save(function() {
                res.redirect('/journal');
            });

        } catch (tagError) {
            console.error("Erreur tags:", tagError);
            req.session.flashMessage = {
                type: 'error',
                text: 'Entrée créée, mais erreur lors de l\'ajout des tags.',
                detail: tagError.message
            };
            res.redirect('/journal');
        }
    });
});

// Modification
app.get('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sqlArticle = "SELECT * FROM articles WHERE id = ?";
    const sqlArticleTags = `SELECT tag_id FROM article_tags WHERE article_id = ?`;
    const sqlAllTags = `SELECT id, name_${lang} as name FROM tags ORDER BY name_${lang} ASC`;
    Promise.all([
        new Promise((resolve, reject) => db.get(sqlArticle, id, (err, row) => err ? reject(err) : resolve(row))),
        new Promise((resolve, reject) => db.all(sqlArticleTags, id, (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.all(sqlAllTags, [], (err, rows) => err ? reject(err) : resolve(rows)))
    ]).then(([article, articleTagRows, allTags]) => {
        if (!article) { return res.status(404).send("Entrée non trouvée !"); }
        const articleTagIds = new Set(articleTagRows.map(row => row.tag_id));
        res.render('edit_entry', {
            article: article,
            pageTitle: `${req.t('page_titles.edit_entry')}: ${article.title_fr}`,
            activePage: 'journal',
            allTags: allTags,
            articleTagIds: articleTagIds
        });
    }).catch(err => {
        console.error(`Erreur BDD (GET /entree/${id}/edit combined):`, err);
        res.status(500).send("Erreur serveur.");
    });
});
app.post('/entree/:id/edit', isAuthenticated, async (req, res) => {
    const id = req.params.id;
    const { title_fr, title_en, summary_fr, content_fr, content_en, cover_image_url, tags } = req.body;
    let summary_en = req.body.summary_en; // Valeur du formulaire

    // --- Gestion des Tags ---
    let tagIds = tags;
    if (tagIds === undefined) { tagIds = []; }
    else if (!Array.isArray(tagIds)) { tagIds = [tagIds]; }
    tagIds = tagIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

    // --- TRADUCTION AUTOMATIQUE DU RÉSUMÉ ---
    if (summary_fr && (!summary_en || summary_en.trim() === '') && translator) {
        try {
            console.log("Traduction automatique du résumé (edit)...");
            const result = await translator.translateText(summary_fr, 'fr', 'en-GB');
            summary_en = result.text;
        } catch (error) {
            console.error("Erreur traduction résumé (edit) :", error);
        }
    }

    const sqlUpdateArticle = 'UPDATE articles SET title_fr = ?, title_en = ?, summary_fr = ?, summary_en = ?, content_fr = ?, content_en = ?, cover_image_url = ? WHERE id = ?';

    db.run(sqlUpdateArticle, [title_fr, title_en, summary_fr, summary_en, content_fr, content_en, cover_image_url, id], async function(err) {
        if (err) { 
            console.error(`Erreur BDD (POST /entree/${id}/edit update):`, err); 
            req.session.flashMessage = {
                type: 'error',
                text: 'Erreur lors de la modification de l\'entrée.',
                detail: err.message // <-- AJOUT DU DÉTAIL
            };
            return res.redirect('/journal');
        }

        try  {
            await processTags(id, tagIds);
            req.session.flashMessage = { type: 'success', text: 'Entrée mise à jour avec succès !' };
            req.session.save(function() {
                res.redirect('/journal')
            })
        } catch (tagError) {
            console.error(`Erreur tags (POST /entree/${id}/edit):`, tagError);
            req.session.flashMessage = {
                type: 'error',
                text: 'Entrée mise à jour, mais erreur sur les tags.',
                detail: tagError.message
            };
            res.redirect('/journal');
        }
    });
});

// Suppression
app.post('/entree/:id/delete', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM articles WHERE id = ?';
    db.run(sql, id, function(err) {
        if (err) {
            console.error(`Erreur BDD (POST /entree/${id}/delete):`, err);
            req.session.flashMessage = {
                type: 'error',
                text: 'Erreur lors de la suppression de l\'entrée.',
                detail: err.message // <-- AJOUT DU DÉTAIL
            };
            return res.redirect('/journal');
        }
        logAction(req, 'DELETE_ARTICLE', `ID supprimé: ${id}`);

        req.session.flashMessage = { type: 'success', text: 'Entrée supprimée avec succès.' };
        
        req.session.save(function() {
            res.redirect('/journal');
        });
    });
});

// Ajout de commentaire (Public)
app.post('/article/:id/comment', commentLimiter, (req, res) => {
    const articleId = req.params.id;
    const { author_name, content } = req.body;

    // 1. Honeypot (Anti-bot)
    if (req.body.website_field && req.body.website_field !== '') {
        return res.redirect(`/entree/${articleId}`);
    }

    // 2. Validation champs vides
    if (!author_name || !content || author_name.trim() === '' || content.trim() === '') {
        req.session.flashMessage = { type: 'error', text: 'Veuillez remplir tous les champs.' };
        
        return req.session.save(() => {
            res.redirect(`/entree/${articleId}`);
        });
    }

    // 3. Modération Automatique (BAD-WORDS)
    if (filter.isProfane(content) || filter.isProfane(author_name)) {
        console.warn(`[Modération Auto] Rejeté : ${author_name}`);

        req.session.flashMessage = {
            type: 'error',
            text: 'Votre commentaire a été rejeté car il contient un langage inapproprié.'
        };

        return req.session.save(() => {
            res.redirect(`/entree/${articleId}`);
        });
    }

    // 4. Insertion BDD
    const sql = `INSERT INTO comments (article_id, author_name, content, is_approved) VALUES (?, ?, ?, 1)`;

    db.run(sql, [articleId, author_name, content], function(err) {
        if (err) {
            console.error("Erreur BDD Commentaire:", err);
            req.session.flashMessage = { type: 'error', text: 'Erreur technique.' };
            return req.session.save(() => res.redirect(`/entree/${articleId}`));
        }

        sendAdminNotification(req, articleId, this.lastID, author_name, content);

        req.session.flashMessage = { type: 'success', text: 'Votre commentaire a été publié !' };

        req.session.save(() => {
            res.redirect(`/entree/${articleId}`);
        });
    });
});

// --- API (Pour le JavaScript Frontend) ---

// Upload d'image (EasyMDE)
app.post('/upload-image', isAuthenticated, apiLimiter, upload.single('image'), async (req, res) => {
    if (!req.file) { return res.status(400).json({ error: 'Aucun fichier reçu.' }); }
    const originalPath = req.file.path;
    const originalFilename = req.file.filename;
    const optimizedFilename = originalFilename.replace(/(\.[\w\d_-]+)$/i, '-opt.webp'); 
    const optimizedPath = path.join('public', 'uploads', optimizedFilename);
    console.log(`[Sharp] Traitement de ${originalFilename} vers ${optimizedFilename}`);
    try {
        await sharp(originalPath)
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(optimizedPath);
        fs.unlink(originalPath, (err) => { if (err) console.error(`[Sharp] Erreur suppression original ${originalPath}:`, err); });
        const optimizedImageUrl = '/uploads/' + optimizedFilename;
        res.json({ imageUrl: optimizedImageUrl });
    } catch (error) {
        console.error("[Sharp] Erreur optimisation image:", error);
        try { fs.unlinkSync(originalPath); } catch (e) {}
        res.status(500).json({ error: "Erreur traitement image." });
    }
});

// Traduction automatique (DeepL)
app.post('/api/translate', isAuthenticated, async (req, res) => {
    if (!translator) {
        return res.status(503).json({ error: 'Service de traduction non disponible.' });
    }

    const textToTranslate = req.body.text;
    const targetLanguage = req.body.targetLang || 'en-GB';


    if (!textToTranslate || textToTranslate.trim() === '') {
        return res.json({ translatedText: '' });
    }

    try {
        const result = await translator.translateText(textToTranslate, 'fr', targetLanguage);
        if (result && typeof result.text === 'string') {
            res.json({ translatedText: result.text });
        } else {
            res.status(500).json({ error: 'Réponse invalide de DeepL.' });
        }
    } catch (error) {
        console.error("Erreur DeepL:", error);
        res.status(500).json({ error: "Erreur lors de la traduction." });
    }
});

// Création rapide de tag (Modale)
app.post('/api/tags/create', isAuthenticated, async (req, res) => {
    const { name_fr, name_en_auto } = req.body;
    if (!name_fr) {
        return res.status(400).json({ error: 'Le nom français est requis.' });
    }
    let name_en = req.body.name_en; // Récupère le nom EN manuel

    if (name_en_auto && translator) { // Si auto-traduction demandée ET DeepL dispo
        try {
            const result = await translator.translateText(name_fr, 'fr', 'en-GB');
            if (result && typeof result.text === 'string') { name_en = result.text; }
            else { name_en = name_fr; } // Fallback
        } catch (error) { name_en = name_fr; /* Fallback */ }
    } else if (!name_en) {
        name_en = name_fr;
    }

    const sql = 'INSERT INTO tags (name_fr, name_en) VALUES (?, ?)';
    db.run(sql, [name_fr, name_en], function(err) {
        if (err) {
            let message = 'Erreur lors de la création du tag.';
            if (err.message.includes('UNIQUE constraint failed')) {
                message = 'Un tag avec ce nom (FR ou EN) existe déjà.';
            }
            return res.status(409).json({ error: message }); // 409 Conflict 
        }

        const lang = req.language === 'en' ? 'en' : 'fr';
        res.status(201).json({
            id: this.lastID,
            name: (lang === 'en' ? name_en : name_fr), // Nom dans la langue actuelle
            name_fr: name_fr,
            name_en: name_en
        });
    });
});

// Recherche en temps réel (Live Search)
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    const lang = req.language === 'en' ? 'en' : 'fr'; // Utilise la langue détectée

    // Si la recherche est vide, on renvoie une liste vide
    if (!query || query.trim() === '') {
        return res.json([]);
    }

    const searchTerm = `%${query}%`;

    // Requête simplifiée pour la recherche rapide (Titre ou Contenu)
    const sql = `
        SELECT id, title_${lang} as title, content_${lang} as content, cover_image_url, publication_date
        FROM articles
        WHERE title_fr LIKE ? OR title_en LIKE ? OR content_fr LIKE ? OR content_en LIKE ?
        ORDER BY publication_date DESC
        LIMIT 10
    `;

    db.all(sql, [searchTerm, searchTerm, searchTerm, searchTerm], (err, rows) => {
        if (err) {
            console.error("Erreur API Search:", err);
            return res.status(500).json({ error: "Erreur serveur" });
        }

        // On prépare les données pour le frontend (nettoyage du markdown, formatage date)
        const results = rows.map(article => {
            // Nettoyage du contenu pour l'extrait
            let text = article.content
                .replace(/!\[.*?\]\(.*?\)/g, '') // Enlève images
                .replace(/^#\s+.*(\r\n|\n|\r)?/, '') // Enlève titre H1
                .replace(/[#*`~_]/g, '') // Enlève symboles
                .trim();

            return {
                id: article.id,
                title: article.title,
                date: new Date(article.publication_date).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR'),
                excerpt: text.substring(0, 150) + '...',
                image: article.cover_image_url
            };
        });

        res.json(results);
    });
});


// =================================================================
// 7. EXPORT DE L'APPLICATION (pour les tests)
// =================================================================
module.exports = { app, db };