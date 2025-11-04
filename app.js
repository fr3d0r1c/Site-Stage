// =================================================================
// 1. IMPORTS (DÉPENDANCES)
// =================================================================
require('dotenv').config(); // Pour lire le .env (identifiants email, etc.)
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session'); // Pour la connexion admin
const bcrypt = require('bcrypt'); // Pour hacher les mots de passe
const multer = require('multer'); // Pour l'upload d'images
const { marked } = require('marked'); // Version 4 de Marked
const i18next = require('i18next'); // Pour la traduction
const i18nextMiddleware = require('i18next-http-middleware');
const FsBackend = require('i18next-fs-backend');
const nodemailer = require('nodemailer'); // Pour envoyer les emails
const crypto = require('crypto'); // Pour le token de reset password
const path = require('path'); // Pour gérer les chemins de fichiers (ex: dossier views)
const helmet = require('helmet'); // Pour la sécurité (CSP, etc.)
const rateLimit = require('express-rate-limit'); // Pour la sécurité (anti-force brute)
const deepl = require('deepl-node');

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
    transporter = nodemailer.createTransport({ /* ... (ta config nodemailer) ... */ });
    console.log("Nodemailer configuré.");
} else {
    console.warn("AVERTISSEMENT : Identifiants email manquants...");
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
        ],
        styleSrc: [
          "'self'",
          "https://unpkg.com/easymde/dist/easymde.min.css",
          "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/",
          "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/",
          "https://fonts.googleapis.com/",
          "https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css",
          "https://maxcdn.bootstrapcdn.com/font-awesome/latest/css/font-awesome.min.css", // <-- AJOUTE CETTE LIGNE
          "'unsafe-inline'"
        ],
        imgSrc: [
          "'self'", // Images du même domaine (tes uploads)
          "data:", // Images encodées (ex: data:image/png;...)
          "https://via.placeholder.com", // Images d'exemple
          "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/", // SVG des drapeaux
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
          "https://cdn.jsdelivr.net/"
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);


// Servir les fichiers statiques (CSS, JS, images) depuis le dossier 'public'
app.use(express.static('public'));

// Middleware pour lire les données de formulaire (ex: <form method="POST">)
app.use(express.urlencoded({ extended: true }));

// Middleware pour lire le JSON (ex: fetch)
app.use(express.json());

// Configuration du middleware de session (pour la connexion admin)
app.use(session({
  secret: 'Z6*31121Mt', // À CHANGER
  resave: false,
  saveUninitialized: true,
  cookie: { 
      secure: process.env.NODE_ENV === 'production', // Mettre à true en production (si HTTPS)
      httpOnly: true, // Le cookie n'est pas accessible en JS côté client
      sameSite: 'strict'
    }
}));

// Middleware pour i18next (traduction)
app.use(i18nextMiddleware.handle(i18next));

// Middleware "maison" pour rendre 'username' disponible dans toutes les vues EJS
app.use((req, res, next) => {
    res.locals.username = req.session.username;
    next();
});

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


// =================================================================
// 5. FONCTION HELPER POUR LES TAGS
// =================================================================
/**
 * Traite et associe les tags à un article (version simplifiée).
 * Prend un tableau d'IDs de tags et les lie à l'article.
 * @param {number} articleId - L'ID de l'article à associer.
 * @param {number[]} tagIds - Un tableau d'IDs de tags (ex: [1, 2, 3]).
 */
async function processTags(articleId, tagIds) {
    // S'assure que tagIds est un tableau de nombres
    const validIds = Array.isArray(tagIds) 
        ? tagIds.map(id => parseInt(id)).filter(id => !isNaN(id)) 
        : [];

    // Utilisation de Promesses pour une meilleure gestion des appels BDD asynchrones
    const deleteLinks = (artId) => new Promise((resolve, reject) => {
        db.run('DELETE FROM article_tags WHERE article_id = ?', [artId], (err) => err ? reject(err) : resolve());
    });

    const insertLinks = (artId, ids) => new Promise((resolve, reject) => {
        if (ids.length === 0) return resolve(); // Ne fait rien si aucun tag n'est sélectionné
        const placeholders = ids.map(() => '(?, ?)').join(',');
        const values = ids.reduce((acc, tagId) => acc.concat([artId, tagId]), []);
        const sql = `INSERT INTO article_tags (article_id, tag_id) VALUES ${placeholders}`;
        db.run(sql, values, (err) => err ? reject(err) : resolve());
    });

    try {
        await deleteLinks(articleId); // Supprime les anciens liens
        await insertLinks(articleId, validIds); // Ajoute les nouveaux liens
    } catch (error) {
         console.error(`Erreur dans processTags pour l'article ${articleId}:`, error);
         throw error; // Relance l'erreur
    }
 }


/**
 * Envoie une notification par email à l'administrateur
 * lorsqu'un nouveau commentaire est posté.
 * @param {object} req - L'objet requête Express (pour host/protocol)
 * @param {number} articleId - L'ID de l'article commenté
 * @param {number} commentId - L'ID du nouveau commentaire
 * @param {string} authorName - Le nom de l'auteur du commentaire
 * @param {string} commentContent - Le contenu du commentaire
 */
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

// =================================================================
// 6. ROUTES (Le Cœur de l'Application)
// =================================================================

// --- PAGES PUBLIQUES (LECTURE) ---

// Page d'accueil
app.get('/', (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sql = `
        SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name_${lang}) as tags
        FROM articles a LEFT JOIN article_tags at ON a.id = at.article_id LEFT JOIN tags t ON at.tag_id = t.id
        GROUP BY a.id ORDER BY a.publication_date DESC LIMIT 3
    `;
    db.all(sql, [], (err, rows) => {
        if (err) { console.error("Erreur BDD (GET /):", err); return res.status(500).send("Erreur serveur."); }
        const articlesWithData = rows.map(article => {
            const tagList = article.tags ? article.tags.split(',') : [];
            let finalCoverImage = null;
            if (article.cover_image_url) { finalCoverImage = article.cover_image_url; }
            else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
            const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
            return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
        });
        
        const message = req.session.flashMessage; // Pour le toast "Bonjour..."
        req.session.flashMessage = null; 

        res.render('index', {
            articles: articlesWithData,
            pageTitle: req.t('page_titles.home'),
            activePage: 'accueil',
            message: message
        });
    });
});

// Pages statiques
app.get('/profil', (req, res) => {
    res.render('profil', {
        pageTitle: req.t('page_titles.profile'),
        activePage: 'profil',
        ogTitle: req.t('page_titles.profile'),
        ogDescription: req.t('static_pages.profile_intro'),
        ogImage: null // Utilise l'image par défaut du header.ejs
    });
});

app.get('/stage', (req, res) => {
    res.render('stage', {
        pageTitle: req.t('page_titles.internship'),
        activePage: 'stage',
        ogTitle: req.t('page_titles.internship'),
        ogDescription: req.t('static_pages.internship_intro'),
        ogImage: null
    });
});

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

app.get('/admin', isAuthenticated, (req, res) => {
    res.render('admin', {
        pageTitle: req.t('admin_page.title'),
        activePage: 'admin'
    });
});

// Page de tout le journal (avec pagination)
app.get('/journal', (req, res) => {
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sqlEntries = `
        SELECT a.id, a.title_${lang} as title, a.content_${lang} as content, a.cover_image_url, a.publication_date, GROUP_CONCAT(t.name_${lang}) as tags
        FROM articles a LEFT JOIN article_tags at ON a.id = at.article_id LEFT JOIN tags t ON at.tag_id = t.id
        GROUP BY a.id ORDER BY a.publication_date DESC LIMIT ? OFFSET ?
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
                let finalCoverImage = null;
                if (article.cover_image_url) { finalCoverImage = article.cover_image_url; } 
                else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
                const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
                return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
            });
            const message = req.session.flashMessage;
            req.session.flashMessage = null;
            res.render('journal', {
                articles: articlesWithData, pageTitle: req.t('page_titles.journal'), activePage: 'journal',
                currentPage: currentPage, totalPages: totalPages, currentTag: null, message: message
            });
        });
    });
});

// Page de détail d'une entrée (avec Précédent/Suivant, Commentaires, OG tags)
app.get('/entree/:id', (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { return res.status(400).send("ID d'entrée invalide."); }
    const lang = req.language === 'en' ? 'en' : 'fr';

    const sqlArticle = `SELECT *, title_${lang} as title, content_${lang} as content FROM articles WHERE id = ?`;
    const sqlTags = `SELECT t.name_${lang} as name FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?`;
    const sqlComments = `SELECT author_name, content, created_at FROM comments WHERE article_id = ? AND is_approved = 1 ORDER BY created_at ASC`;

    db.get(sqlArticle, id, (err, article) => {
        if (err) { console.error(`Erreur BDD (GET /entree/${id} article):`, err); return res.status(500).send("Erreur serveur."); }
        if (!article) { return res.status(404).send("Entrée non trouvée !"); }

        const currentPublicationDate = article.publication_date;
        const sqlPrev = `SELECT id, title_${lang} as title FROM articles WHERE publication_date < ? ORDER BY publication_date DESC LIMIT 1`;
        const sqlNext = `SELECT id, title_${lang} as title FROM articles WHERE publication_date > ? ORDER BY publication_date ASC LIMIT 1`;

        Promise.all([
            new Promise((resolve, reject) => db.all(sqlTags, id, (err, rows) => err ? reject(err) : resolve(rows))),
            new Promise((resolve, reject) => db.get(sqlPrev, [currentPublicationDate], (err, row) => err ? reject(err) : resolve(row))),
            new Promise((resolve, reject) => db.get(sqlNext, [currentPublicationDate], (err, row) => err ? reject(err) : resolve(row))),
            new Promise((resolve, reject) => db.all(sqlComments, id, (err, rows) => err ? reject(err) : resolve(rows)))
        ]).then(([tagRows, prevEntry, nextEntry, comments]) => {

            article.tags = tagRows.map(tag => tag.name);

            // Préparation des métadonnées OG
            const ogDescription = (article.content || '')
                .replace(/!\[.*?\]\(.*?\)/g, '').replace(/[#*`~_]/g, '').replace(/\s+/g, ' ')
                .substring(0, 155).trim() + '...';
            let ogImage = article.cover_image_url;
            if (!ogImage) { const match = article.content.match(/!\[.*?\]\((.*?)\)/); ogImage = match ? match[1] : null; }
            
            const siteBaseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`; // Utilise l'URL de Render si dispo
            let absoluteOgImage = `${siteBaseUrl}/default-banner.png`;
            if (ogImage) {
                absoluteOgImage = ogImage.startsWith('http') ? ogImage : `${siteBaseUrl}${ogImage}`;
            }

            // Nettoyage et parsing du contenu
            let finalContent = article.content;
            const markdownTitle = '# ' + article.title;
            if (finalContent && finalContent.trim().startsWith(markdownTitle)) {
                finalContent = finalContent.substring(markdownTitle.length).trim();
            }
            try { article.content = marked.parse(finalContent || ''); } 
            catch (parseError) { console.error(`Erreur parsing Markdown article ${id}:`, parseError); article.content = "<p style='color:red;'>Erreur rendu Markdown.</p>"; }

            res.render('entry_detail', {
                article: article, pageTitle: article.title, activePage: 'journal',
                prevEntry: prevEntry || null, nextEntry: nextEntry || null,
                comments: comments || [],
                messageSent: req.query.comment === 'success' ? true : (req.query.comment === 'error' ? false : null),
                ogTitle: article.title,
                ogDescription: ogDescription,
                ogImage: absoluteOgImage,
                ogType: 'article'
            });

        }).catch(promiseErr => {
            console.error(`Erreur BDD (GET /entree/${id} promises):`, promiseErr);
            res.status(500).send("Erreur serveur lors de la récupération des données.");
        });
    });
});

// --- RECHERCHE ---
app.get('/search', (req, res) => {
    const query = req.query.query;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const message = req.session.flashMessage;
    req.session.flashMessage = null;
    if (!query) { return res.render('search_results', { articles: [], query: '', pageTitle: req.t('page_titles.search'), activePage: 'search', message: message }); }
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
        res.render('search_results', { articles: articlesWithData, query: query, pageTitle: `${req.t('search.results_for')} "${query}"`, activePage: 'search', message: message });
    });
});

// --- FILTRAGE PAR TAG ---
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
        if (!tag) { return res.render('journal', { articles: [], pageTitle: `Tag introuvable : "${tagName}"`, activePage: 'journal', currentPage: 1, totalPages: 0, currentTag: tagName, message: message }); }
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
                 res.render('journal', { articles: articlesWithData, pageTitle: `Tag : "${tagName}"`, activePage: 'journal', currentPage: currentPage, totalPages: totalPages, currentTag: tagName, message: message });
            });
        });
    });
});

// --- PLAN DU SITE (SITEMAP) ---
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


// --- AUTHENTIFICATION ET GESTION COMPTE ---

// Affiche le formulaire de connexion
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

// Traite la tentative de connexion
app.post('/connexion', authLimiter, (req, res) => {
    const { username, password } = req.body;
    const sql = 'SELECT * FROM users WHERE username = ?';
    db.get(sql, [username], (err, user) => {
        if (err) { console.error("Erreur BDD (POST /connexion findUser):", err); return res.status(500).send("Erreur serveur."); }
        if (!user) { return res.render('login', { pageTitle: req.t('page_titles.login'), error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin', resetSuccess: false, message: null }); }
        bcrypt.compare(password, user.password, (errCompare, result) => {
            if (errCompare) { return res.render('login', { /* ... error: "Erreur serveur" ... */ }); }
            if (result) {
                req.session.userId = user.id; req.session.username = user.username;
                req.session.flashMessage = { type: 'success', text: `Bonjour, ${user.username} !` }; // Message de bienvenue
                res.redirect('/');
            } else { res.render('login', { pageTitle: req.t('page_titles.login'), error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin', resetSuccess: false, message: null }); }
        });
    });
});

// Route de déconnexion
app.get('/deconnexion', (req, res) => {
    req.session.destroy(err => {
        if (err) { console.error("Erreur déconnexion:", err); return res.redirect('/'); }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Affiche/Traite le formulaire d'inscription (conditionnel)
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
                 if (errInsert.message.includes('UNIQUE constraint failed')) { errorMessage = "Ce nom d'utilisateur ou cet email est déjà pris."; }
                 console.error("Erreur BDD (POST /inscription insert):", errInsert);
                 return res.render('register', { pageTitle: req.t('page_titles.register'), activePage: 'admin', error: errorMessage });
            }
            req.session.flashMessage = { type: 'success', text: 'Compte administrateur créé ! Vous pouvez vous connecter.' }; // Message de succès
            res.redirect('/connexion');
        });
    });
});

// --- MOT DE PASSE OUBLIÉ ---
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

// --- CHANGER MOT DE PASSE (LOGGED IN) ---
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
                            pageTitle: pageTitle, activePage: activePage,
                            error: 'Erreur lors de la mise à jour du mot de passe.', success: null
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

// --- API UPLOAD IMAGE (pour EasyMDE) ---
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

// --- FORMULAIRE CONTACT ---
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


// --- GESTION DU CONTENU (ROUTES PROTÉGÉES) ---

// Affiche le formulaire de création
app.get('/journal/nouvelle', isAuthenticated, (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sqlTags = `SELECT id, name_${lang} as name FROM tags ORDER BY name_${lang} ASC`;
    db.all(sqlTags, [], (err, allTags) => {
        if (err) { allTags = []; console.error("Erreur BDD (GET /journal/nouvelle tags):", err); }
        res.render('new_entry', {
            pageTitle: req.t('page_titles.new_entry'), activePage: 'journal',
            allTags: allTags, articleTags: []
        });
    });
});

// Traite la création d'une entrée (bilingue + tags)
app.post('/journal', isAuthenticated, async (req, res) => {
    const { title_fr, title_en, content_fr, content_en, cover_image_url } = req.body;
    const userId = req.session.userId;
    let tagIds = req.body.tags;
    if (tagIds === undefined) { tagIds = []; } else if (!Array.isArray(tagIds)) { tagIds = [tagIds]; }
    tagIds = tagIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    
    const sqlInsertArticle = 'INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id, cover_image_url) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sqlInsertArticle, [title_fr, title_en, content_fr, content_en, userId, cover_image_url], async function(err) {
        if (err) { console.error("Erreur BDD (POST /journal insert):", err); return res.status(500).send("Erreur serveur."); }
        const articleId = this.lastID;
        try {
            await processTags(articleId, tagIds); // Utilise les tag IDs
            req.session.flashMessage = { type: 'success', text: 'Entrée créée avec succès !' };
            res.redirect('/journal');
        } catch (tagError) {
            console.error("Erreur tags (POST /journal):", tagError); res.status(500).send("Erreur tags.");
        }
    });
});

// Affiche le formulaire de modification (bilingue + tags)
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

// Traite la modification d'une entrée (bilingue + tags)
app.post('/entree/:id/edit', isAuthenticated, async (req, res) => {
    const id = req.params.id;
    const { title_fr, title_en, content_fr, content_en, cover_image_url } = req.body;
    let tagIds = req.body.tags;
    if (tagIds === undefined) { tagIds = []; } else if (!Array.isArray(tagIds)) { tagIds = [tagIds]; }
    tagIds = tagIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    const sqlUpdateArticle = 'UPDATE articles SET title_fr = ?, title_en = ?, content_fr = ?, content_en = ?, cover_image_url = ? WHERE id = ?';
    db.run(sqlUpdateArticle, [title_fr, title_en, content_fr, content_en, cover_image_url, id], async function(err) {
        if (err) { console.error(`Erreur BDD (POST /entree/${id}/edit update):`, err); return res.status(500).send("Erreur serveur."); }
        try {
            await processTags(id, tagIds);
            req.session.flashMessage = { type: 'success', text: 'Entrée mise à jour avec succès !' };
            res.redirect('/journal');
        } catch (tagError) {
            console.error(`Erreur tags (POST /entree/${id}/edit):`, tagError);
            res.status(500).send("Erreur tags.");
        }
    });
});

// Traite la suppression d'une entrée
app.post('/entree/:id/delete', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM articles WHERE id = ?';
    db.run(sql, id, function(err) {
        if (err) { console.error(`Erreur BDD (POST /entree/${id}/delete):`, err); return res.status(500).send("Erreur serveur."); }
        req.session.flashMessage = { type: 'success', text: 'Entrée supprimée avec succès.' };
        res.redirect('/journal');
    });
});

// --- GESTION DES COMMENTAIRES (Admin & Public) ---

// (Admin) Affiche la page de modération
app.get('/admin/comments', isAuthenticated, (req, res) => {
    const sqlPending = `SELECT c.id, c.author_name, c.content, c.created_at, a.title_fr as article_title, a.id as article_id FROM comments c JOIN articles a ON c.article_id = a.id WHERE c.is_approved = 0 ORDER BY c.created_at ASC`;
    const sqlApproved = `SELECT c.id, c.author_name, c.content, c.created_at, a.title_fr as article_title, a.id as article_id FROM comments c JOIN articles a ON c.article_id = a.id WHERE c.is_approved = 1 ORDER BY c.created_at DESC`;
    Promise.all([
        new Promise((resolve, reject) => db.all(sqlPending, [], (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.all(sqlApproved, [], (err, rows) => err ? reject(err) : resolve(rows)))
    ]).then(([pendingComments, approvedComments]) => {
        const message = req.session.flashMessage;
        req.session.flashMessage = null;
        res.render('admin-comments', {
            pageTitle: req.t('admin_page.manage_comments_title'),
            activePage: 'admin',
            pendingComments: pendingComments,
            approvedComments: approvedComments,
            message: message
        });
    }).catch(err => {
        console.error("Erreur BDD (GET /admin/comments):", err);
        res.status(500).send("Erreur serveur.");
    });
});

// (Admin) Traite l'approbation d'un commentaire
app.post('/admin/comments/approve/:id', isAuthenticated, (req, res) => {
    const commentId = req.params.id;
    const sql = 'UPDATE comments SET is_approved = 1 WHERE id = ?';
    db.run(sql, [commentId], function(err) {
        if (err) { req.session.flashMessage = { type: 'error', text: 'Erreur approbation.' }; }
        else { req.session.flashMessage = { type: 'success', text: `Commentaire #${commentId} approuvé.` }; }
        res.redirect('/admin/comments');
    });
});

// (Admin) Traite la suppression d'un commentaire
app.post('/admin/comments/delete/:id', isAuthenticated, (req, res) => {
    const commentId = req.params.id;
    const sql = 'DELETE FROM comments WHERE id = ?';
    db.run(sql, [commentId], function(err) {
        if (err) { req.session.flashMessage = { type: 'error', text: 'Erreur suppression.' }; }
        else { req.session.flashMessage = { type: 'success', text: `Commentaire #${commentId} supprimé.` }; }
        res.redirect('/admin/comments');
    });
});

// (Public) Traite la soumission d'un nouveau commentaire
app.post('/article/:id/comment', commentLimiter, (req, res) => {
    const articleId = req.params.id;
    const { author_name, content } = req.body;
    // 1. Vérification Honeypot
    if (req.body.website_field && req.body.website_field !== '') {
        console.warn("Honeypot (commentaire) déclenché ! Rejet silencieux.");
        return res.redirect(`/entree/${articleId}?comment=success`); // Faux succès
    }
    // 2. Validation
    if (!author_name || !content || author_name.trim() === '' || content.trim() === '') {
        return res.redirect(`/entree/${articleId}?comment=error`);
    }
    // 3. Insertion BDD
    const sql = `INSERT INTO comments (article_id, author_name, content, is_approved) VALUES (?, ?, ?, 0)`;
    db.run(sql, [articleId, author_name, content], function(err) {
        if (err) { return res.redirect(`/entree/${articleId}?comment=error`); }
        // 4. Envoi notification admin (sans bloquer l'utilisateur)
        sendAdminNotification(req, articleId, this.lastID, author_name, content);
        res.redirect(`/entree/${articleId}?comment=success`);
    });
});

// --- GESTION DES TAGS (Admin) ---
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

// --- API POUR LA TRADUCTION ---
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
             res.status(500).json({ error: 'Réponse invalide du service de traduction.' });
        }
    } catch (error) {
        console.error("Erreur DeepL:", error);
        res.status(500).json({ error: `Échec traduction: ${error.message || 'Erreur inconnue'}` });
    }
});

// --- API POUR LA CRÉATION RAPIDE DE TAGS (JSON) ---
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
})

app.post('/admin/tags/delete/:id', isAuthenticated, (req, res) => {
    const tagId = req.params.id;

    const sql = 'DELETE FROM tags WHERE id = ?';

    db.run(sql, [tagId], function(err) {
        let message;
        if (err) {
            console.error(`Erreur BDD (POST /admin/tags/delete/${tagId}):`, err);
            message = { type: 'error', text: 'Erreur lors de la suppression du tag.' };
        } else if (this.changes === 0) {
            message = { type: 'error', text: 'Tag non trouvé pour la suppression.' };
        } else {
            message = { type: 'success', text: `Tag #${tagId} supprimé avec succès.` };
        }

        req.session.flashMessage = message;
        res.redirect('/admin/tags');
    });
});

// =================================================================
// 7. EXPORT DE L'APPLICATION (pour les tests)
// =================================================================
module.exports = { app, db };