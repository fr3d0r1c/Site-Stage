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
const cookieParser = require('cookie-parser');
const { randomUUID } = require('crypto');
const RSS = require('rss');
const NodeCache = require('node-cache');


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
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // On définit le dossier de destination
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        // On génère un nom unique MAIS on garde l'extension d'origine (ex: .jpg)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Initialisation de l'upload avec cette configuration
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

const myCache = new NodeCache();

// =================================================================
// 3. MIDDLEWARES
// =================================================================

// 1. Fichiers Statiques (CSS/JS/Images) -> TOUJOURS EN PREMIER
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// 2. Sécurité & Parsers
app.use(
    helmet({
        crossOriginEmbedderPolicy: false,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                connectSrc: [
                    "'self'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com", 
                    "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://api.dicebear.com", 
                    "https://maxcdn.bootstrapcdn.com"
                ],
                scriptSrc: [
                    "'self'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"
                ],
                styleSrc: [
                    "'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", 
                    "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://maxcdn.bootstrapcdn.com"
                ],
                fontSrc: [
                    "'self'", "data:", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", 
                    "https://maxcdn.bootstrapcdn.com", "https://unpkg.com"
                ],
                imgSrc: ["'self'", "data:", "https:", "blob:"],
                frameSrc: [
                    "'self'",
                    "https://www.youtube.com",
                    "https://youtube.com",
                    "https://www.youtube-nocookie.com",
                    "https://player.vimeo.com"
                ],
                childSrc: [
                    "'self'",
                    "https://www.youtube.com",
                    "https://youtube.com",
                    "https://www.youtube-nocookie.com",
                    "https://player.vimeo.com"
                ],
                upgradeInsecureRequests: [],
            },
        },
    })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// 3. Session
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

// 4. Middleware "PONT" (Global)
app.use(async (req, res, next) => {
    res.locals.username = req.session.username;
    res.locals.userId = req.session.userId;

    res.locals.message = req.session.flashMessage;
    delete req.session.flashMessage;

    res.locals.cookies = req.cookies;

    res.locals.guest = null;

    if (req.cookies.guest_token) {
        try {
            // On utilise la valeur du cookie pour chercher dans la BDD
            const guest = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM guests WHERE id = ?', [req.cookies.guest_token], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });

            if (guest) {
                const seed = encodeURIComponent(guest.name);
                guest.avatarUrl = `https://api.dicebear.com/7.x/${guest.avatar_style}/svg?seed=${seed}`;
                res.locals.guest = guest;
            }
        } catch (e) {
            console.error("Erreur middleware guest:", e);
        }
    }

    next();
});

// 5. Traduction (i18next)
app.use(i18nextMiddleware.handle(i18next));

const filter = new Filter();

filter.addWords(...frenchBadWordsList);

filter.addWords('testbad');

app.use((req, res, next) => {
    console.log(`➡️ Requête reçue : ${req.method} ${req.url}`);
    next();
});

const isProduction = process.env.NODE_ENV === 'production';

app.use((req, res, next) => {
    const isMaintenance = process.env.MAINTENANCE_MODE === 'true';

    if (isMaintenance) {
        // On rend la vue avec le titre traduit
        return res.status(503).render('maintenance', {
            pageTitle: req.t('maintenance.title')
        });
    }

    next();
});

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

function checkAdminExists(req, res, next) {
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) {
            console.error("Erreur BDD (checkAdminExists):", err);
            return res.status(500).send("Erreur serveur lors de la vérification admin.");
        }
        if (row.count === 0) {
            next();
        } else {
            res.redirect('/connexion');
        }
    });
}

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true, 
    legacyHeaders: false,
    message: { error: 'Trop de requêtes depuis cette IP, veuillez réessayer après 15 minutes.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    legacyHeaders: false,
    message: { error: 'Trop de tentatives de connexion/reset depuis cette IP, veuillez réessayer après 15 minutes.' }
});

const contactLimiter = rateLimit({
     windowMs: 60 * 60 * 1000,
     max: 10,
     standardHeaders: true,
     legacyHeaders: false,
     handler: (req, res, next, options) => {
         res.status(options.statusCode).render('contact', {
             pageTitle: req.t('page_titles.contact'),
             activePage: 'contact',
             messageSent: false,
             error: options.message.error
         });
     }
});

const commentLimiter = rateLimit({
     windowMs: 10 * 60 * 1000, 
     max: 5,
     standardHeaders: true,
     legacyHeaders: false,
     handler: (req, res, next, options) => {
         console.warn(`Rate limit dépassé pour les commentaires (IP: ${req.ip})`);
         res.redirect(`/entree/${req.params.id}?comment=error`);
     }
});

const cacheMiddleware = (duration) => (req, res, next) => {
    if (req.method !== 'GET' || req.session.userId || res.locals.message) {
        return next();
    }

    const key = '__express__' + req.originalUrl || req.url;

    const cachedBody = myCache.get(key);

    if (cachedBody) {
        return res.send(cachedBody);
    } else {
        res.sendResponse = res.send;
        res.send = (body) => {
            if (res.statusCode === 200) {
                myCache.set(key, body, duration);
            }
            res.sendResponse(body);
        };
        next();
    }
};

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
  likes INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published',
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
  avatar_url TEXT,
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
  parent_id INTEGER DEFAULT NULL,
  guest_id TEXT, -- NOUVEAU : Lien vers l'invité
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

// Création de la table 'guests' (Comptes Invités)
const createGuestsTable = `
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  avatar_style TEXT DEFAULT 'bottts',
  comment_count INTEGER DEFAULT 0, -- NOUVEAU
  like_count INTEGER DEFAULT 0,    -- NOUVEAU
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
db.run(createGuestsTable);

// Création de la table 'article_likes'
const createLikesTable = `
CREATE TABLE IF NOT EXISTS article_likes (
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
);
`;
db.run(createLikesTable);

const createSubscribersTable = `
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
db.run(createSubscribersTable);

// Création de la table 'contact_messages'
const createContactTable = `
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  subject TEXT, -- NOUVEAU : L'objet du message
  message TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
db.run(createContactTable);

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

// Fonction pour transformer une liste plate de commentaires en arbre (Parents -> Enfants)
function nestComments(comments) {
    const commentMap = {};
    const roots = [];

    // 1. On initialise tous les commentaires avec un tableau 'replies' vide
    comments.forEach(c => {
        c.replies = [];
        commentMap[c.id] = c;
    });

    // 2. On les range
    comments.forEach(c => {
        if (c.parent_id && commentMap[c.parent_id]) {
            // C'est une réponse, on la met dans le tableau du parent
            commentMap[c.parent_id].replies.push(c);
        } else {
            // C'est un commentaire principal
            roots.push(c);
        }
    });

    return roots;
}

/**
 * Fonction Helper pour insérer un commentaire en base de données.
 * Gère l'insertion SQL, les notifications et la redirection.
 */
function insertComment(req, res, articleId, parentId, author_name, author_email, author_avatar, content, isApproved, isAdmin, guestId) {
    
    const sql = `INSERT INTO comments (article_id, parent_id, guest_id, author_name, author_email, author_avatar, content, is_approved, is_admin, delete_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const parentIdValue = parentId ? parseInt(parentId) : null;
    const deleteToken = isAdmin ? null : crypto.randomUUID(); 

    db.run(sql, [articleId, parentIdValue, guestId, author_name, author_email, author_avatar, content, isApproved, isAdmin, deleteToken], function(err) {
        if (err) { 
            // ... (Gestion erreur inchangée)
            console.error(err);
            return res.redirect('back');
        }
        
        // 1. Gamification (Invité)
        if (guestId) {
            db.run('UPDATE guests SET comment_count = comment_count + 1 WHERE id = ?', [guestId]);
        }

        // 2. Notification ADMIN (Si nouveau fil de discussion)
        if (!isAdmin && !parentIdValue) {
             sendAdminNotification(req, articleId, this.lastID, author_name, content);
        }

        // 3. --- NOUVEAU : NOTIFICATION RÉPONSE (Si c'est une réponse) ---
        if (parentIdValue) {
            // On lance l'envoi en tâche de fond (pas de await pour ne pas ralentir l'utilisateur)
            sendReplyNotification(articleId, parentIdValue, author_name, content);
        }
        // ---------------------------------------------------------------

        if (!req.session.flashMessage) {
             req.session.flashMessage = { type: 'success', text: 'Votre commentaire a été publié !' };
        }
        
        if (deleteToken) {
            res.cookie(`can_delete_${this.lastID}`, deleteToken, { maxAge: 31536000000, httpOnly: true });
        }
        
        req.session.save(() => res.redirect(`/entree/${articleId}`));
    });
}

/**
 * Calcule le temps de lecture estimé d'un texte.
 * Vitesse moyenne : 200 mots / minute.
 */
function getReadingTime(text) {
    if (!text) return 1;
    const cleanText = text.replace(/<[^>]*>/g, '').replace(/[#*`~_]/g, '');
    const wordCount = cleanText.split(/\s+/).length;
    return Math.ceil(wordCount / 200);
}

/**
 * Envoie une notification par email à tous les abonnés
 * lors de la publication d'un nouvel article.
 */
async function sendNewPostNotification(articleId, title, summary) {
    if (!transporter) return; // Si pas de mail configuré, on sort

    // 1. Récupérer les emails des abonnés
    const sql = 'SELECT email FROM subscribers';

    db.all(sql, [], async (err, rows) => {
        if (err || !rows || rows.length === 0) return;

        const siteUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
        const articleUrl = `${siteUrl}/entree/${articleId}`;

        // Liste des destinataires (en copie cachée BCC pour la confidentialité)
        const recipients = rows.map(r => r.email).join(', ');

        const mailOptions = {
            from: process.env.EMAIL_USER,
            bcc: recipients, // Important : BCC pour ne pas divulguer les emails
            subject: `Nouvel article : ${title}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #0056b3;">Nouvelle publication !</h2>
                    <p>Bonjour,</p>
                    <p>Un nouvel article vient d'être publié sur mon carnet de stage :</p>
                    <hr>
                    <h3>${title}</h3>
                    <p><em>${summary || 'Cliquez ci-dessous pour découvrir le contenu...'}</em></p>
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="${articleUrl}" style="background-color: #0056b3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                            Lire l'article
                        </a>
                    </p>
                    <hr>
                    <small style="color: #666;">Vous recevez cet email car vous êtes abonné au flux du Carnet de Stage.</small>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`✉️ Notification envoyée à ${rows.length} abonnés.`);
        } catch (error) {
            console.error("Erreur envoi notification article:", error);
        }
    });
}

/**
 * Calcule les badges d'un invité selon ses stats
 */
function getGuestBadges(guest) {
    const badges = [];
    
    // Badges Commentaires
    if (guest.comment_count >= 1) badges.push({ icon: 'fa-comment', title: 'Premier Mot', color: '#17a2b8' });
    if (guest.comment_count >= 5) badges.push({ icon: 'fa-comments', title: 'Bavard', color: '#28a745' });
    if (guest.comment_count >= 10) badges.push({ icon: 'fa-crown', title: 'Expert', color: '#ffc107' });

    // Badges Likes
    if (guest.like_count >= 1) badges.push({ icon: 'fa-heart', title: 'Fan', color: '#e83e8c' });
    if (guest.like_count >= 10) badges.push({ icon: 'fa-heartbeat', title: 'Super Fan', color: '#dc3545' });

    return badges;
}

// Fonction Helper pour renvoyer le résultat
function getLikesCount(articleId, res, isLiked) {
    db.get('SELECT likes FROM articles WHERE id = ?', [articleId], (err, row) => {
        res.json({ likes: row ? row.likes : 0, liked: isLiked });
    });
}

/**
 * Envoie un email à l'auteur du commentaire parent
 */

async function sendReplyNotification(articleId, parentId, replierName, replyContent) {
    if (!parentId || !transporter) return; // Pas de parent ou pas de mailer = stop

    try {
        const sql = `
            SELECT c.author_name, c.author_email, c.is_admin, a.title_fr as article_title 
            FROM comments c
            JOIN articles a ON c.article_id = a.id
            WHERE c.id = ?
        `;

        const parent = await new Promise((resolve, reject) => {
            db.get(sql, [parentId], (err, row) => err ? reject(err) : resolve(row));
        });

        if (!parent) return;

        let recipientEmail = parent.author_email;

        if (parent.is_admin) {
            recipientEmail = process.env.EMAIL_TO;
        }

        if (!recipientEmail || !recipientEmail.includes('@')) return;

        if (parent.author_name === replierName) return;

        const siteUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
        const link = `${siteUrl}/entree/${articleId}#comment-${parentId}`; // Ancre vers le commentaire

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: recipientEmail,
            subject: `Nouvelle réponse de ${replierName} sur "${parent.article_title}"`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
                    <h2 style="color: #0056b3;">Quelqu'un a répondu à votre commentaire !</h2>
                    <p>Bonjour <strong>${parent.author_name}</strong>,</p>
                    <p><strong>${replierName}</strong> vient de répondre à votre message sur l'article <em>"${parent.article_title}"</em>.</p>
                    
                    <div style="background: #f9f9f9; border-left: 4px solid #0056b3; padding: 10px; margin: 15px 0;">
                        <strong>Le message :</strong><br>
                        "${replyContent}"
                    </div>

                    <p style="text-align: center; margin-top: 20px;">
                        <a href="${link}" style="background-color: #0056b3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                            Voir la réponse
                        </a>
                    </p>
                    <hr>
                    <small style="color: #888;">Vous recevez cet email car vous suivez cette discussion sur le Carnet de Stage.</small>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Notification de réponse envoyée à ${recipientEmail}`);
    } catch (error) {
        console.error("Erreur notification réponse:", error);
    }
}

// =================================================================
// 6. ROUTES (Le Cœur de l'Application)
// =================================================================

// ROUTES PUBLIQUES (Accessibles à tous)

// --- SEO & RSS ---
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
app.get('/feed.xml', (req, res) => {
    const siteUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

    const feed = new RSS({
        title: 'Carnet de Stage - Frederic Alleron',
        description: 'Journal de bord de mon stage ingénieur à l\'étranger.',
        feed_url: `${siteUrl}/feed.xml`,
        site_url: siteUrl,
        image_url: `${siteUrl}/images/logo.png`,
        language: 'fr',
        pubDate: new Date().toUTCString(),
        ttl: '60'
    });

    const sql = `
        SELECT * FROM articles 
        WHERE status = 'published' 
        ORDER BY publication_date DESC 
        LIMIT 20
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Erreur RSS:", err);
            return res.status(500).send("Erreur génération flux");
        }

        rows.forEach(article => {
            let cleanContent = article.content_fr.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
            let htmlContent = marked.parse(cleanContent);

            let imageUrl = null;
            if (article.cover_image_url) {
                imageUrl = article.cover_image_url.startsWith('http') 
                    ? article.cover_image_url 
                    : `${siteUrl}${article.cover_image_url}`;
            }

            feed.item({
                title:  article.title_fr,
                description: htmlContent, // Le contenu complet en HTML
                url: `${siteUrl}/entree/${article.id}`, // Lien vers l'article
                guid: article.id,
                categories: [], // Tu pourrais ajouter les tags ici si tu fais une requête JOIN
                author: 'Frederic Alleron',
                date: article.publication_date,
                enclosure: imageUrl ? { url: imageUrl } : undefined // Image attachée
            });
        });

        res.set('Content-Type', 'application/xml');
        res.send(feed.xml());
    });
});

// --- Pages Statiques ---
app.get('/', cacheMiddleware(600), (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';
    
    const sql = `
        SELECT
            a.id, a.title_${lang} as title, 
            a.summary_${lang} as summary, -- ON RÉINTÈGRE LE RÉSUMÉ
            a.content_${lang} as content,
            a.cover_image_url, a.publication_date,
            GROUP_CONCAT(t.name_${lang}) as tags
        FROM articles a
        LEFT JOIN article_tags at ON a.id = at.article_id
        LEFT JOIN tags t ON at.tag_id = t.id
        WHERE status = 'published'
        GROUP BY a.id
        ORDER BY a.publication_date DESC
        LIMIT 3
    `;

    db.all(sql, [], (err, rows) => {
        if (err) { console.error("Erreur BDD (GET /):", err); return res.status(500).send("Erreur serveur."); }

        const articlesWithData = rows.map(article => {
            const tagList = article.tags ? article.tags.split(',') : [];
            
            let finalCoverImage = article.cover_image_url;
            if (!finalCoverImage) {
                const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                finalCoverImage = match ? match[1] : null;
            }

            // --- LOGIQUE COMBINÉE : Résumé + Temps de lecture ---
            
            // 1. Temps de lecture (sur le contenu total)
            const readingTime = getReadingTime(article.content);

            // 2. Extrait (Résumé manuel OU Contenu coupé)
            let excerpt = "";
            if (article.summary && article.summary.trim() !== '') {
                excerpt = article.summary;
            } else {
                let textContent = article.content.replace(/!\[.*?\]\(.*?\)/g, '');
                textContent = textContent.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                const plainContent = textContent.replace(/[#*`~_]|(\[.*?\]\(.*?\))/g, '');
                excerpt = plainContent.substring(0, 350) + "...";
            }
            // ----------------------------------------------------

            return { 
                ...article, 
                tags: tagList, 
                coverImage: finalCoverImage, 
                excerpt: excerpt, 
                readingTime: readingTime 
            };
        });
        
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
app.get('/profil/qui-suis-je', cacheMiddleware(3600), (req, res) => {
    res.render('whoami', { pageTitle: 'Qui suis-je ?', activePage: 'profil' });
});
app.get('/profil/parcours-scolaire', cacheMiddleware(3600), (req, res) => {
    res.render('school', { pageTitle: 'Parcours Scolaire', activePage: 'profil' });
});
app.get('/profil/parcours-pro', cacheMiddleware(3600), (req, res) => {
    res.render('work', { pageTitle: 'Parcours Professionnel', activePage: 'profil' });
});
app.get('/stage/l-entreprise', cacheMiddleware(3600), (req, res) => {
    res.render('company', { pageTitle: "L'entreprise", activePage: 'stage' });
});
app.get('/stage/mes-missions', cacheMiddleware(3600), (req, res) => {
    res.render('missions', { pageTitle: 'Mes Missions', activePage: 'stage' });
});
app.get('/chronologie', (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';

    // Récupère tous les articles publiés, triés par date (le plus vieux en premier pour une frise logique)
    const sql = `SELECT id, title_${lang} as title, publication_date, cover_image_url FROM articles WHERE status = 'published' ORDER BY publication_date ASC`;

    db.all(sql, [], (err, rows) => {
        res.render('timeline-journal', {
            pageTitle: 'Chronologie du Stage',
            activePage: 'journal',
            articles: rows
        });
    });
});

// --- Blog & Recherche ---
app.get('/journal', cacheMiddleware(600), (req, res) => {
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const lang = req.language === 'en' ? 'en' : 'fr';

    const sortOption = req.query.sort || 'date_desc';
    let sortClause = 'ORDER BY a.publication_date DESC';

    switch (sortOption) {
        case 'date_asc': sortClause = 'ORDER BY a.publication_date ASC'; break;
        case 'alpha_asc': sortClause = `ORDER BY title_${lang} ASC`; break;
        case 'alpha_desc': sortClause = `ORDER BY title_${lang} DESC`; break;
        case 'tag_asc': sortClause = 'ORDER BY tags ASC'; break;
        case 'tag_desc': sortClause = 'ORDER BY tags DESC'; break;
    }

    const statusClause = req.session.userId ? "" : "WHERE status = 'published'";

    const sqlEntries = `
        SELECT
            a.id, a.title_${lang} as title, 
            a.summary_${lang} as summary,
            a.content_${lang} as content,
            a.cover_image_url, a.publication_date,
            a.status, -- ON RÉCUPÈRE LE STATUT POUR L'AFFICHAGE
            GROUP_CONCAT(t.name_${lang}) as tags
        FROM articles a
        LEFT JOIN article_tags at ON a.id = at.article_id
        LEFT JOIN tags t ON at.tag_id = t.id
        ${statusClause} -- Injection dynamique
        GROUP BY a.id
        ${sortClause}
        LIMIT ? OFFSET ?
    `;
    
    const sqlCount = req.session.userId
        ? `SELECT COUNT(*) as totalCount FROM articles`
        : `SELECT COUNT(*) as totalCount FROM articles WHERE status = 'published'`;

    db.all(sqlEntries, [ITEMS_PER_PAGE, offset], (err, rows) => {
        if (err) { console.error("Erreur BDD:", err); return res.status(500).send("Erreur serveur."); }

        db.get(sqlCount, [], (errCount, countResult) => {
            const totalEntries = countResult.totalCount;
            const totalPages = Math.ceil(totalEntries / ITEMS_PER_PAGE);

            const articlesWithData = rows.map(article => {
                const tagList = article.tags ? article.tags.split(',') : [];
                let finalCoverImage = article.cover_image_url;
                if (!finalCoverImage) {
                    const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                    finalCoverImage = match ? match[1] : null;
                }

                const readingTime = getReadingTime(article.content);

                let excerpt = "";
                if (article.summary && article.summary.trim() !== '') {
                    excerpt = article.summary;
                } else {
                    let textContent = article.content.replace(/!\[.*?\]\(.*?\)/g, '').replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                    const plainContent = textContent.replace(/[#*`~_]|(\[.*?\]\(.*?\))/g, '');
                    excerpt = plainContent.substring(0, 350) + "...";
                }

                return { 
                    ...article, 
                    tags: tagList, 
                    coverImage: finalCoverImage, 
                    excerpt: excerpt, 
                    readingTime: readingTime,
                    status: article.status // On passe le statut à la vue !
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
app.get('/search', (req, res) => {
    const query = req.query.query || '';
    const tagId = parseInt(req.query.tag) || null;
    const sortOption = req.query.sort || 'date_desc';
    const lang = req.language === 'en' ? 'en' : 'fr';
    const message = req.session.flashMessage;
    req.session.flashMessage = null;

    const sqlAllTags = `SELECT id, name_${lang} as name FROM tags ORDER BY name_${lang} ASC`;

    db.all(sqlAllTags, [], (errTags, allTags) => {
        if (!query && !tagId) {
            return res.render('search_results', {
                articles: [], query: '', currentTagId: null, currentSort: sortOption,
                allTags: allTags, pageTitle: req.t('page_titles.search'), activePage: 'search', message: message
            });
        }

        let sqlParams = [];
        let whereClauses = [];

        if (query) {
            whereClauses.push('(a.title_fr LIKE ? OR a.title_en LIKE ? OR a.content_fr LIKE ? OR a.content_en LIKE ?)');
            const searchTerm = `%${query}%`;
            sqlParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        if (tagId) {
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
                a.id, a.title_${lang} as title, 
                a.summary_${lang} as summary,
                a.content_${lang} as content,
                a.cover_image_url, a.publication_date,
                GROUP_CONCAT(DISTINCT t.name_${lang}) as tags
            FROM articles a
            LEFT JOIN article_tags at_display ON a.id = at_display.article_id
            LEFT JOIN tags t ON at_display.tag_id = t.id
            ${tagId ? 'JOIN article_tags at_filter ON a.id = at_filter.article_id' : ''}
            WHERE ${whereClauses.join(' AND ')} AND status = 'published'
            GROUP BY a.id
            ${sortClause}
        `;

        db.all(sql, sqlParams, (err, rows) => {
            const articlesWithData = rows.map(article => {
                const tagList = article.tags ? article.tags.split(',') : [];
                let finalCoverImage = article.cover_image_url;
                if (!finalCoverImage) {
                    const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                    finalCoverImage = match ? match[1] : null;
                }
                let textContent = article.content.replace(/!\[.*?\]\(.*?\)/g, '');
                textContent = textContent.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                const plainContent = textContent.replace(/[#*`~_]|(\[.*?\]\(.*?\))/g, '');

                return { 
                    ...article, 
                    tags: tagList, 
                    coverImage: finalCoverImage, 
                    excerpt: plainContent.substring(0, 350),
                    readingTime: getReadingTime(article.content) // <-- Utilisation de 'article'
                };
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
app.get('/tags/:tagName', (req, res) => {
    const tagName = req.params.tagName;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const message = req.session.flashMessage;
    req.session.flashMessage = null;

    const sqlFindTag = `SELECT id FROM tags WHERE name_${lang} = ?`;
    
    db.get(sqlFindTag, [tagName], (errTag, tag) => {
        if (!tag) return res.render('journal', { articles: [], pageTitle: "Tag introuvable", activePage: 'journal', currentPage: 1, totalPages: 0, currentTag: tagName, message: message, currentSort: null });
        
        const tagId = tag.id;
        const sqlEntries = `
            SELECT
                a.id, a.title_${lang} as title, 
                a.summary_${lang} as summary,
                a.content_${lang} as content,
                a.cover_image_url, a.publication_date,
                GROUP_CONCAT(t.name_${lang}) as tags
            FROM articles a
            JOIN article_tags at ON a.id = at.article_id
            LEFT JOIN article_tags at_all ON a.id = at_all.article_id
            LEFT JOIN tags t ON at_all.tag_id = t.id
            WHERE at.tag_id = ?
            AND status = status = 'published'
            GROUP BY a.id
            ORDER BY a.publication_date DESC
            LIMIT ? OFFSET ?
        `;
        
        db.all(sqlEntries, [tagId, ITEMS_PER_PAGE, offset], (err, rows) => {
            // CORRECTION ICI
            const articlesWithData = rows.map(article => {
                const tagList = article.tags ? article.tags.split(',') : [];
                let finalCoverImage = article.cover_image_url;
                if (!finalCoverImage) {
                    const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                    finalCoverImage = match ? match[1] : null;
                }
                let textContent = article.content.replace(/!\[.*?\]\(.*?\)/g, '');
                textContent = textContent.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                const plainContent = textContent.replace(/[#*`~_]|(\[.*?\]\(.*?\))/g, '');

                return { 
                    ...article, 
                    tags: tagList, 
                    coverImage: finalCoverImage, 
                    excerpt: plainContent.substring(0, 350),
                    readingTime: getReadingTime(article.content) // <-- Utilisation de 'article'
                };
            });
            
            // ... (reste du code render) ...
            res.render('journal', {
                     articles: articlesWithData,
                     pageTitle: `Tag : "${tagName}"`,
                     activePage: 'journal',
                     currentPage: currentPage,
                     totalPages: Math.ceil(1 / ITEMS_PER_PAGE), // Simplifié ici, à ajuster avec le vrai count
                     currentTag: tagName,
                     message: message,
                     currentSort: null
            });
        });
    });
});

// --- Espace Invité ---
app.get('/guest/login', (req, res) => {
    // Si l'invité est déjà connecté (cookie présent), on l'envoie au dashboard
    if (req.cookies.guest_token) {
        return res.redirect('/guest/dashboard');
    }

    // Sinon, on affiche la page de choix (guest-login.ejs)
    res.render('guest-login', { 
        pageTitle: 'Espace Invité', 
        activePage: 'guest' 
    });
});
app.post('/guest/login', async (req, res) => {
    const { name, email, avatar_style } = req.body;
    
    let guestId = req.cookies.guest_token;
    let isNew = false;

    if (!guestId) {
        guestId = crypto.randomUUID();
        isNew = true;
    }

    if (isNew) {
        db.run('INSERT INTO guests (id, name, email, avatar_style) VALUES (?, ?, ?, ?)', [guestId, name, email, avatar_style]);
    } else {
        db.run('UPDATE guests SET name = ?, email = ?, avatar_style = ? WHERE id = ?', [name, email, avatar_style, guestId]);
    }

    res.cookie('guest_token', guestId, { maxAge: 31536000000, httpOnly: true });
    
    // Réponse JSON (pour la pop-up)
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({ success: true, message: 'Profil configuré !' });
    }

    // Réponse Classique (pour le formulaire page dédiée)
    req.session.flashMessage = { type: 'success', text: `Profil invité ${isNew ? 'créé' : 'mis à jour'} !` };
    req.session.save(() => res.redirect('/guest/dashboard'));
});
app.post('/guest/recover', (req, res) => {
    const { name, email } = req.body;

    db.get('SELECT * FROM guests WHERE name = ? AND email = ?', [name, email], (err, guest) => {
        if (guest) {
            res.cookie('guest_token', guest.id, { maxAge: 31536000000, httpOnly: true });
            
            // Réponse JSON
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.json({ success: true, message: `Bon retour, ${guest.name} !` });
            }

            req.session.flashMessage = { type: 'success', text: `Profil retrouvé ! Bon retour, ${guest.name}.` };
            res.redirect('/guest/dashboard');
        } else {
            // Erreur JSON
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(404).json({ success: false, error: 'Profil introuvable.' });
            }

            req.session.flashMessage = { type: 'error', text: 'Aucun profil trouvé avec ce pseudo et cet email.' };
            res.redirect('/guest/login'); // Redirige vers la page qu'on vient de restaurer
        }
    });
});
app.get('/guest/dashboard', (req, res) => {
    const guestId = req.cookies.guest_token;
    if (!guestId) return res.redirect('/guest/login');

    db.get('SELECT * FROM guests WHERE id = ?', [guestId], (err, guest) => {
        if (!guest) {
            res.clearCookie('guest_token');
            return res.redirect('/guest/login');
        }

        const sqlComments = `
            SELECT c.*, a.title_fr as article_title 
            FROM comments c
            JOIN articles a ON c.article_id = a.id
            WHERE c.guest_id = ?
            ORDER BY c.created_at DESC
        `;

        db.all(sqlComments, [guestId], (errComm, comments) => {
            const seed = encodeURIComponent(guest.name);
            const avatarUrl = `https://api.dicebear.com/7.x/${guest.avatar_style}/svg?seed=${seed}`;

            res.render('guest-dashboard', {
                pageTitle: 'Mon Tableau de Bord',
                activePage: 'guest',
                guest: { ...guest, avatarUrl },
                myComments: comments || []
            });
        });
    });
});
app.get('/guest/logout', (req, res) => {
    res.clearCookie('guest_token');
    req.session.flashMessage = { type: 'success', text: 'Vous êtes déconnecté du mode invité.' };
    req.session.save(() => res.redirect('/'));
});

// --- Lecture Article & Interactions ---
app.get('/entree/:id', (req, res) => {
    const id = req.params.id;
    const lang = req.language === 'en' ? 'en' : 'fr';

    // Identifiants actuels (pour les checks)
    const currentUserId = req.session.userId || null;
    const currentGuestId = req.cookies.guest_token || null;

    // 1. Récupérer l'article
    const sqlArticle = `SELECT * FROM articles WHERE id = ?`;

    db.get(sqlArticle, [id], (err, article) => {
        if (err) { console.error(err); return res.status(500).send("Erreur BDD."); }
        if (!article) { return res.status(404).render('404', { pageTitle: 'Article introuvable', activePage: '' }); }

        // SÉCURITÉ : Si brouillon et pas admin -> 404
        if (article.status === 'draft' && !currentUserId) {
            return res.status(404).render('404', { pageTitle: 'Article non disponible', activePage: '' });
        }

        // COMPTEUR DE VUES (Sauf pour l'admin)
        if (!currentUserId) {
            db.run('UPDATE articles SET views = views + 1 WHERE id = ?', [id]);
            article.views += 1; // Mise à jour visuelle
        }

        // --- PRÉPARATION DES REQUÊTES PARALLÈLES ---
        const currentPublicationDate = article.publication_date;
        const statusFilter = currentUserId ? "" : "AND status = 'published'";

        // A. Tags de l'article
        const sqlTags = `SELECT t.name_${lang} as name FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?`;
        
        const sqlPrev = `SELECT id, title_${lang} as title FROM articles WHERE publication_date < ? ${statusFilter} ORDER BY publication_date DESC LIMIT 1`;
        const sqlNext = `SELECT id, title_${lang} as title FROM articles WHERE publication_date > ? ${statusFilter} ORDER BY publication_date ASC LIMIT 1`;
        
        const sqlComments = `
            SELECT 
                c.id, c.parent_id, c.guest_id, c.author_name, c.author_email, c.author_avatar, c.content, c.created_at, c.is_admin,
                g.comment_count, g.like_count 
            FROM comments c 
            LEFT JOIN guests g ON c.guest_id = g.id
            WHERE c.article_id = ? AND c.is_approved = 1 
            ORDER BY c.created_at ASC
        `;
        
        const sqlSimilar = `
            SELECT DISTINCT a.id, a.title_${lang} as title, a.cover_image_url, a.publication_date
            FROM articles a
            JOIN article_tags at ON a.id = at.article_id
            WHERE at.tag_id IN (SELECT tag_id FROM article_tags WHERE article_id = ?)
            AND a.id != ?
            ${statusFilter.replace('AND', 'AND a.')} 
            ORDER BY RANDOM() 
            LIMIT 3
        `;
        
        const sqlCheckLike = `SELECT id FROM article_likes WHERE article_id = ? AND (user_id = ? OR guest_id = ?)`;

        Promise.all([
            new Promise((resolve) => db.all(sqlTags, [id], (e, r) => resolve(r || []))),
            new Promise((resolve) => db.get(sqlPrev, [currentPublicationDate], (e, r) => resolve(r))),
            new Promise((resolve) => db.get(sqlNext, [currentPublicationDate], (e, r) => resolve(r))),
            new Promise((resolve) => db.all(sqlComments, [id], (e, r) => resolve(r || []))),
            new Promise((resolve) => db.all(sqlSimilar, [id, id], (e, r) => resolve(r || []))),
            new Promise((resolve) => {
                if (!currentUserId && !currentGuestId) return resolve(null);
                db.get(sqlCheckLike, [id, currentUserId, currentGuestId], (e, r) => resolve(r));
            })
        ]).then(([tagRows, prevEntry, nextEntry, flatComments, similarArticles, likeRow]) => {

            article.tags = tagRows.map(tag => tag.name);

            article.title = article[`title_${lang}`];
            let contentRaw = article[`content_${lang}`];

            contentRaw = contentRaw.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();

            article.readingTime = getReadingTime(contentRaw);

            article.content = marked.parse(contentRaw);

            const commentsTree = nestComments(flatComments);

            const hasLiked = !!likeRow;

            const plainText = contentRaw.replace(/[#*`~_]|(\[.*?\]\(.*?\))/g, '').substring(0, 160);
            const ogDescription = (article[`summary_${lang}`] || plainText) + '...';
            let ogImage = article.cover_image_url;
            if (ogImage && !ogImage.startsWith('http')) {
                ogImage = (process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000') + ogImage;
            }

            res.render('entry_detail', {
                article: article,
                pageTitle: article.title,
                activePage: 'journal',
                
                prevEntry: prevEntry || null,
                nextEntry: nextEntry || null,
                
                comments: commentsTree, // Liste structurée
                similarArticles: similarArticles,
                hasLiked: hasLiked,

                ogTitle: article.title,
                ogDescription: ogDescription,
                ogImage: ogImage,
                ogType: 'article'
            });
        }).catch(err => {
            console.error("Erreur chargement détails:", err);
            res.status(500).send("Erreur serveur lors du chargement de la page.");
        });
    });
});
app.post('/article/:id/comment', commentLimiter, async (req, res) => {
    const articleId = req.params.id;
    let { author_name, author_email, content, parent_id, author_avatar_style } = req.body;

    const guestId = req.cookies.guest_token || null;

    // 1. HONEYPOT (Protection Anti-robot)
    if (req.body.website_field && req.body.website_field !== '') {
        // On redirige silencieusement sans rien faire
        return res.redirect(`/entree/${articleId}`);
    }

    // 2. VALIDATION (Champs requis pour les visiteurs)
    if (!req.session.userId && (!author_name || !author_email || !content)) {
        req.session.flashMessage = { type: 'error', text: 'Nom, Email et Message sont requis.' };
        return req.session.save(() => res.redirect(`/entree/${articleId}`));
    }

    // 3. MODÉRATION AUTOMATIQUE (Bad-words)
    if (filter.isProfane(content) || filter.isProfane(author_name)) {
        req.session.flashMessage = { type: 'error', text: 'Votre commentaire a été rejeté (langage inapproprié).' };
        return req.session.save(() => res.redirect(`/entree/${articleId}`));
    }

    // 4. CALCUL DE L'AVATAR
    let author_avatar = '';

    if (req.session.userId) {
        // C'est l'ADMIN : on récupère son avatar depuis la BDD
        const user = await new Promise(resolve => db.get('SELECT avatar_url FROM users WHERE id = ?', [req.session.userId], (err, row) => resolve(row)));
        author_avatar = user ? user.avatar_url : '';
    } else {
        // C'est un VISITEUR : on génère l'avatar DiceBear selon le style choisi
        const style = author_avatar_style || 'bottts'; // Style par défaut
        const seed = encodeURIComponent(author_name);
        author_avatar = `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
    }

    // 5. LOGIQUE DE TRAITEMENT

    // --- CAS A : ADMIN ---
    if (req.session.userId && req.session.username) {
        return insertComment(
            req, res, 
            articleId, parent_id, 
            req.session.username, 'admin@internal', author_avatar, content, 
            1, 1, 
            null // Pas de guestId pour l'admin
        );
    }

    // --- CAS B : VISITEUR (Déduplication Intelligente) ---
    const sqlCheck = `SELECT author_name, author_email FROM comments WHERE author_name = ? OR author_name LIKE ?`;

    db.all(sqlCheck, [author_name, `${author_name} %`], (err, rows) => {
        if (!err) {
            // On cherche si le pseudo exact existe déjà
            const existingUser = rows.find(row => row.author_name.toLowerCase() === author_name.toLowerCase());

            if (existingUser && existingUser.author_email !== author_email) {
                let counter = 1;
                let newName = `${author_name} ${counter}`;
                while (rows.some(row => row.author_name.toLowerCase() === newName.toLowerCase())) counter++;
                author_name = newName;
                req.session.flashMessage = { type: 'info', text: `Publié sous "${author_name}" (pseudo pris).` };
                const seed = encodeURIComponent(author_name);
                author_avatar = `https://api.dicebear.com/7.x/${author_avatar_style || 'bottts'}/svg?seed=${seed}`;
            }
        }

        insertComment(
            req, res, 
            articleId, parent_id, 
            author_name, author_email, author_avatar, content, 
            1, 0, 
            guestId // <-- ON PASSE L'ID ICI
        );
    });
});

// --- Contact ---
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
app.post('/contact', (req, res) => {
    const { name, email, subject, message } = req.body;

    const sql = 'INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)';

    db.run(sql, [name, email, subject, message], async function(err) {
        if (err) console.error("Erreur sauvegarde contact:", err);

        if (transporter) {
            const mailOptions = {
                from: `"${name}" <${process.env.EMAIL_USER}>`,
                
                to: process.env.EMAIL_TO,

                replyTo: email,
                // Le sujet du mail devient le sujet saisi par l'utilisateur (avec un préfixe)
                subject: `[Contact Site] ${subject}`,

                html: `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                        <h2 style="color: #0056b3; margin-top: 0;">Nouveau message de contact</h2>
                        <p><strong>De :</strong> ${name} (<a href="mailto:${email}">${email}</a>)</p>
                        <p><strong>Objet :</strong> ${subject}</p>
                        <hr>
                        <p style="white-space: pre-wrap; font-size: 1.1em;">${message}</p>
                    </div>
                `
            };
            
            try { await transporter.sendMail(mailOptions); }
            catch (mailErr) { console.error("Erreur mail:", mailErr); }
        }

        res.render('contact', { 
            pageTitle: req.t('page_titles.contact'), 
            activePage: 'contact', 
            messageSent: true 
        });
    });
});

// --- Newsletter ---
app.post('/newsletter/subscribe', (req, res) => {
    const email = req.body.email;
    
    // Validation simple
    if (!email || !email.includes('@')) {
        req.session.flashMessage = { type: 'error', text: 'Email invalide.' };
        return req.session.save(() => res.redirect('/')); // Retour accueil
    }

    const sql = 'INSERT INTO subscribers (email) VALUES (?)';
    
    db.run(sql, [email], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                req.session.flashMessage = { type: 'info', text: 'Vous êtes déjà inscrit !' };
            } else {
                console.error("Erreur newsletter:", err);
                req.session.flashMessage = { type: 'error', text: 'Erreur technique.' };
            }
        } else {
            req.session.flashMessage = { type: 'success', text: 'Inscription réussie ! Merci.' };
        }
        
        // CORRECTION : On sauvegarde et on redirige vers l'accueil (sûr)
        req.session.save(() => res.redirect('/'));
    });
});

// API (AJAX - Doit être avant les erreurs)
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
app.post('/api/entree/:id/like', async (req, res) => {
    const articleId = req.params.id;
    const userId = req.session.userId || null;
    const guestId = req.cookies.guest_token || null;

    if (!userId && !guestId) return res.status(401).json({ error: "Identification requise" });

    // 1. On vérifie si le like existe DÉJÀ
    let sqlCheck, params;
    
    if (userId) {
        sqlCheck = 'SELECT id FROM article_likes WHERE article_id = ? AND user_id = ?';
        params = [articleId, userId];
    } else {
        sqlCheck = 'SELECT id FROM article_likes WHERE article_id = ? AND guest_id = ?';
        params = [articleId, guestId];
    }
    
    db.get(sqlCheck, params, (err, existingLike) => {
        if (err) return res.status(500).json({ error: "Erreur BDD" });

        if (existingLike) {
            // CAS A : DÉJÀ LIKÉ -> ON UNLIKE (Suppression)
            db.run('DELETE FROM article_likes WHERE id = ?', [existingLike.id], (errDel) => {
                if (errDel) return res.status(500).json({ error: "Erreur delete" });
                
                // Décrémenter le compteur
                db.run('UPDATE articles SET likes = likes - 1 WHERE id = ?', [articleId], () => {
                    getLikesCount(articleId, res, false);
                });
            });
        } else {
            // CAS B : PAS LIKÉ -> ON LIKE (Ajout)
            const sqlInsert = `INSERT INTO article_likes (article_id, user_id, guest_id) VALUES (?, ?, ?)`;
            db.run(sqlInsert, [articleId, userId, guestId], (errIns) => {
                if (errIns) return res.status(500).json({ error: "Erreur insert" });
                
                // Incrémenter le compteur
                db.run('UPDATE articles SET likes = likes + 1 WHERE id = ?', [articleId], () => {
                    // Gamification (Invité)
                    if (guestId) {
                        db.run('UPDATE guests SET like_count = like_count + 1 WHERE id = ?', [guestId]);
                    }
                    getLikesCount(articleId, res, true);
                });
            });
        }
    });
});
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

// AUTHENTIFICATION (Admin)
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
app.get('/inscription', checkAdminExists, (req, res) => { res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: null }); });
app.post('/inscription', checkAdminExists, authLimiter, upload.single('avatar'), (req, res) => {
    const { username, password, email } = req.body;

    // Validation basique
    if (!email || !email.includes('@')) {
        return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: 'Adresse email invalide.' });
    }
    if (!password || password.length < 8) {
        return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: 'Le mot de passe doit faire au moins 8 caractères.' });
    }

    let avatarUrl = null;
    if (req.file) {
        avatarUrl = '/uploads/' + req.file.filename;
    } else {
        const style = req.body.avatar_style || 'bottts'; // Récupère le choix ou met 'bottts' par défaut
        const seed = encodeURIComponent(username);
        avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
    }

    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (errHash, hash) => {
        if (errHash) {
            console.error("Erreur hachage:", errHash);
            return res.status(500).send("Erreur serveur.");
        }

        const sql = 'INSERT INTO users (username, password, email, avatar_url) VALUES (?, ?, ?, ?)';

        db.run(sql, [username, hash, email, avatarUrl], function(errInsert) {
            if (errInsert) {
                let errorMessage = "Erreur création compte.";
                if (errInsert.message.includes('UNIQUE constraint failed')) {
                    errorMessage = "Ce nom d'utilisateur ou cet email est déjà pris.";
                }
                console.error("Erreur BDD:", errInsert);
                return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: errorMessage });
            }

            req.session.flashMessage = { type: 'success', text: 'Compte administrateur créé ! Vous pouvez vous connecter.' };
            res.redirect('/connexion');
        });
    });
});
app.get('/deconnexion', (req, res) => {
    req.session.destroy(err => {
        if (err) { console.error("Erreur déconnexion:", err); return res.redirect('/'); }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});
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

// ROUTES PROTÉGÉES (Admin - isAuthenticated)
app.get('/admin', isAuthenticated, (req, res) => {
    res.redirect('/admin/dashboard');
});

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
            (SELECT COUNT(*) FROM tags) as totalTags,
            (SELECT COUNT(*) FROM contact_messages) as totalMessages -- AJOUT ICI
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
app.get('/admin/newsletter', isAuthenticated, (req, res) => {
    db.all('SELECT * FROM subscribers', [], (err, rows) => {
        res.render('admin-newsletter', {
            pageTitle: 'Gestion Newsletter',
            activePage: 'admin',
            subscribers: rows || []
        });
    });
});
app.post('/admin/newsletter/send', isAuthenticated, async (req, res) => {
    const { subject, message } = req.body;
    
    if (!subject || !message) {
        req.session.flashMessage = { type: 'error', text: 'Sujet et message requis.' };
        return req.session.save(() => res.redirect('/admin/newsletter'));
    }

    // 1. Récupérer tous les emails
    db.all('SELECT email FROM subscribers', [], async (err, rows) => {
        if (err || rows.length === 0) {
            req.session.flashMessage = { type: 'warning', text: 'Aucun abonné ou erreur BDD.' };
            return req.session.save(() => res.redirect('/admin/newsletter'));
        }

        // 2. Préparer les destinataires (BCC)
        const recipients = rows.map(r => r.email).join(', ');

        const mailOptions = {
            from: process.env.EMAIL_USER,
            bcc: recipients, // Envoi caché
            subject: subject,
            html: `<div style="font-family: sans-serif;">
                    <h2>Bonjour !</h2>
                    <p>${message.replace(/\n/g, '<br>')}</p>
                    <hr>
                    <small>Vous recevez cet email car vous êtes abonné au Carnet de Stage.</small>
                   </div>`
        };

        try {
            if (transporter) {
                await transporter.sendMail(mailOptions);
                req.session.flashMessage = { type: 'success', text: `Newsletter envoyée à ${rows.length} abonnés !` };
            } else {
                req.session.flashMessage = { type: 'error', text: 'Serveur mail non configuré.' };
            }
        } catch (e) {
            console.error("Erreur envoi newsletter:", e);
            req.session.flashMessage = { type: 'error', text: 'Erreur lors de l\'envoi des emails.' };
        }

        // CORRECTION : On sauvegarde avant de rediriger
        req.session.save(() => {
            res.redirect('/admin/newsletter');
        });
    });
});
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
    const { title_fr, title_en, summary_fr, content_fr, content_en, cover_image_url, tags, action } = req.body;
    let summary_en = req.body.summary_en;
    const userId = req.session.userId;

    const status = (action === 'draft') ? 'draft' : 'published';

    let tagIds = tags;
    if (tagIds === undefined) { tagIds = []; } 
    else if (!Array.isArray(tagIds)) { tagIds = [tagIds]; }
    tagIds = tagIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

    if (summary_fr && (!summary_en || summary_en.trim() === '') && translator) {
        try {
            console.log("Traduction automatique du résumé (création)...");
            const result = await translator.translateText(summary_fr, 'fr', 'en-GB');
            if (result && typeof result.text === 'string') {
                summary_en = result.text;
            }
        } catch (error) {
            console.error("Erreur traduction résumé :", error);
        }
    }

    const sqlInsertArticle = 'INSERT INTO articles (title_fr, title_en, summary_fr, summary_en, content_fr, content_en, user_id, cover_image_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

    db.run(sqlInsertArticle, [title_fr, title_en, summary_fr, summary_en, content_fr, content_en, userId, cover_image_url, status], async function(err) {
        if (err) { 
            console.error("Erreur BDD (POST /journal insert):", err); 
            req.session.flashMessage = { 
                type: 'error', 
                text: 'Erreur lors de la création de l\'entrée.', 
                detail: err.message 
            };
            return req.session.save(() => res.redirect('/journal/nouvelle'));
        }

        const articleId = this.lastID;
        try {
            await processTags(articleId, tagIds);

            if (status === 'published') {
                sendNewPostNotification(articleId, title_fr, summary_fr);
            }
            
            // Message adapté au statut
            const msgText = status === 'draft' ? 'Brouillon sauvegardé avec succès !' : 'Entrée publiée avec succès !';
            
            myCache.flushAll();

            req.session.flashMessage = { type: 'success', text: msgText };
            req.session.save(() => res.redirect('/journal'));
        } catch (tagError) {
            console.error("Erreur tags (POST /journal):", tagError); 
            req.session.flashMessage = { type: 'error', text: 'Entrée créée mais erreur tags.', detail: tagError.message };
            req.session.save(() => res.redirect('/journal'));
        }
    });
});
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
    const { title_fr, title_en, summary_fr, content_fr, content_en, cover_image_url, tags, action } = req.body;
    let summary_en = req.body.summary_en;

    const status = (action === 'draft') ? 'draft' : 'published';

    let tagIds = tags;
    if (tagIds === undefined) { tagIds = []; } 
    else if (!Array.isArray(tagIds)) { tagIds = [tagIds]; }
    tagIds = tagIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

    if (summary_fr && (!summary_en || summary_en.trim() === '') && translator) {
        try {
            console.log("Traduction automatique du résumé (modif)...");
            const result = await translator.translateText(summary_fr, 'fr', 'en-GB');
            summary_en = result.text;
        } catch (error) {
            console.error("Erreur traduction résumé (edit) :", error);
        }
    }

    const sqlUpdateArticle = 'UPDATE articles SET title_fr = ?, title_en = ?, summary_fr = ?, summary_en = ?, content_fr = ?, content_en = ?, cover_image_url = ?, status = ? WHERE id = ?';

    db.get('SELECT status FROM articles WHERE id = ?', [id], (errGet, oldArticle) => {
        db.run(sqlUpdateArticle, [title_fr, title_en, summary_fr, summary_en, content_fr, content_en, cover_image_url, status, id], async function(err) {
            if (err) { 
                console.error(`Erreur BDD (POST /entree/${id}/edit update):`, err); 
                req.session.flashMessage = { 
                    type: 'error', 
                    text: 'Erreur lors de la modification.', 
                    detail: err.message 
                };
                return req.session.save(() => res.redirect(`/entree/${id}/edit`));
            }

            try {
                await processTags(id, tagIds);

                if (oldArticle && oldArticle.status === 'draft' && status === 'published') {
                     sendNewPostNotification(id, title_fr, summary_fr);
                }

                const msgText = status === 'draft' ? 'Brouillon mis à jour !' : 'Entrée mise à jour !';

                myCache.flushAll();

                req.session.flashMessage = { type: 'success', text: msgText };
                req.session.save(() => res.redirect('/journal'));
            } catch (tagError) {
                console.error(`Erreur tags (POST /entree/${id}/edit):`, tagError);
                req.session.flashMessage = { type: 'error', text: 'Erreur tags.', detail: tagError.message };
                req.session.save(() => res.redirect('/journal'));
            }
        });
    });
});
app.post('/entree/:id/delete', isAuthenticated, (req, res) => {
    const id = req.params.id;

    const sql = 'DELETE FROM articles WHERE id = ?';

    db.run(sql, [id], function(err) {
        if (err) {
            console.error(`Erreur BDD (POST /entree/${id}/delete):`, err);
            req.session.flashMessage = { 
                type: 'error', 
                text: 'Erreur lors de la suppression de l\'entrée.',
                detail: err.message 
            };
            return req.session.save(() => res.redirect(`/entree/${id}`));
        }

        myCache.flushAll();

        req.session.flashMessage = { type: 'success', text: 'Entrée supprimée avec succès.' };

        req.session.save(() => res.redirect('/journal'));
    });
});
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
app.post('/admin/comments/delete/:id', async (req, res) => {
    const commentId = req.params.id;
    const returnTo = req.query.returnTo || '/admin/comments';

    // 1. Récupérer le commentaire pour vérifier le token
    db.get('SELECT delete_token FROM comments WHERE id = ?', [commentId], (err, comment) => {
        if (err || !comment) {
            req.session.flashMessage = { type: 'error', text: 'Commentaire introuvable.' };
            return res.redirect(returnTo);
        }

        // 2. VÉRIFICATION DES DROITS
        const isAdmin = req.session.userId; // Est-ce l'admin connecté ?
        const userToken = req.cookies[`can_delete_${commentId}`]; // Le visiteur a-t-il le cookie ?
        const isOwner = userToken && userToken === comment.delete_token; // Le cookie correspond-il à la BDD ?

        if (isAdmin || isOwner) {
            // 3. Suppression autorisée
            db.run('DELETE FROM comments WHERE id = ?', [commentId], (errDel) => {
                if (errDel) {
                    req.session.flashMessage = { type: 'error', text: 'Erreur technique.' };
                } else {
                    req.session.flashMessage = { type: 'success', text: 'Commentaire supprimé.' };
                    // Si c'était le propriétaire, on nettoie son cookie
                    if (isOwner) res.clearCookie(`can_delete_${commentId}`);
                }
                req.session.save(() => res.redirect(returnTo));
            });
        } else {
            // 4. Refus
            req.session.flashMessage = { type: 'error', text: 'Vous n\'avez pas le droit de supprimer ce commentaire.' };
            req.session.save(() => res.redirect(returnTo));
        }
    });
});

app.get('/admin/messages', isAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM contact_messages ORDER BY created_at DESC';

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).send("Erreur BDD");
        
        res.render('admin-messages', {
            pageTitle: "Messagerie",
            activePage: 'admin',
            messages: rows
        });
    });
});

app.post('/admin/messages/delete/:id', isAuthenticated, (req, res) => {
    db.run('DELETE FROM contact_messages WHERE id = ?', [req.params.id], (err) => {
        req.session.flashMessage = { type: 'success', text: 'Message supprimé.' };
        req.session.save(() => res.redirect('/admin/messages'));
    });
});

// GESTION ERREUR 404 (TOUJOURS EN DERNIER)
app.use((req, res, next) => {
    res.status(404).render('404', {
        pageTitle: '404 - Page Introuvable',
        activePage: ''
    });
});

// DÉMARRAGE SERVEUR

module.exports = { app, db };

if (require.main === module) {
    app.listen(port, () => {
        console.log(`🚀 Serveur démarré sur http://localhost:${port}`);
        console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
    });
}