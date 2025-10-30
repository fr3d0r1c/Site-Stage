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
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const sharp = require('sharp');
const fs = require('fs'); // Module Node.js pour interagir avec les fichiers

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
        // 1. Nettoie le nom original
        const safeOriginalName = file.originalname
            .replace(/\s+/g, '-') // Remplace les espaces par des tirets
            .replace(/[^a-zA-Z0-9\-._]/g, ''); // Supprime les caractères non autorisés (sauf tirets, points, underscores)
        
        // 2. Crée le nom de fichier unique avec le nom nettoyé
        const uniqueSuffix = Date.now();
        const extension = path.extname(safeOriginalName); // Récupère l'extension
        const baseName = path.basename(safeOriginalName, extension); // Récupère le nom sans extension

        cb(null, `${uniqueSuffix}-${baseName}${extension}`); // Ex: 176...-Image-Benji.jpg
    }
});
const upload = multer({ storage: storage });

// --- Configuration Rate Limiter ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Fenêtre de 15 minutes
    max: 100, // Limite chaque IP à 100 requêtes par fenêtre (pour les API générales comme l'upload)
    standardHeaders: true, // Renvoie les informations de limite dans les headers `RateLimit-*`
    legacyHeaders: false, // Désactive les headers `X-RateLimit-*` (obsolètes)
    message: { error: 'Trop de requêtes depuis cette IP, veuillez réessayer après 15 minutes.' } // Message d'erreur JSON
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Fenêtre de 15 minutes
    max: 5, // Limite les tentatives d'authentification/reset à 5 par fenêtre
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de tentatives de connexion/reset depuis cette IP, veuillez réessayer après 15 minutes.' }
});

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // Fenêtre de 1 heure
    max: 10, // Limite les envois de formulaire de contact à 10 par heure
    standardHeaders: true,
    legacyHeaders: false,
    // Pour les formulaires HTML, on peut rediriger ou rendre une vue avec une erreur
    handler: (req, res, next, options) => {
        res.status(options.statusCode).render('contact', { // Recharge la page contact
            pageTitle: req.t('page_titles.contact'),
            activePage: 'contact',
            messageSent: false,
            error: options.message.error // Affiche l'erreur du limiteur
         });
    }
});

const commentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // Fenêtre de 10 minutes
    max: 5, // Limite chaque IP à 5 commentaires toutes les 10 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de commentaires envoyés depuis cette IP, veuillez réessayer plus tard.' }
});

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

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self"],
                scriptSrc: [
                    "'self'",
                    "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
                    "https://unpkg.com/easymde/dist/easymde.min.js",
                ],
                styleSrc: [
                    "'self'",
                    "https://unpkg.com/easymde/dist/easymde.min.css",      
                    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/",
                    "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/",
                    "https://fonts.googleapis.com/", // <-- AJOUTÉ pour Google Fonts CSS
                    "'unsafe-inline'"
                ],
                imgSrc: [
                    "'self'", // Ton domaine (pour les uploads)
                    "data:", // Pour les images encodées
                    "https://via.placeholder.com", // Pour les images d'exemple
                    "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/", // <-- AJOUTÉ pour les SVG des drapeaux
                    // Ajoute d'autres domaines d'images si nécessaire
                ],
                fontSrc: [
                    "'self'",
                    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/", // Pour Font Awesome
                    "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/", // Pour Flag Icon Fonts
                    "https://fonts.gstatic.com" // Pour Google Fonts (si utilisé)
                ],
                connectSrc: [
                    "'self'", // Autorise les connexions au même domaine (pour l'API upload)
                    // Si tu utilises DeepL, ajoute son domaine API ici si nécessaire
                    // Ex: "https://api-free.deepl.com"
                ],
                frameSrc: [
                    // Si tu utilises Google Translate (Solution A), décommente :
                    // "https://translate.google.com",
                    // "https://*.google.com"
                ], // Pour les iframes (Google Translate)
                objectSrc: ["'none'"], // N'autorise pas <object>, <embed>, <applet>
                upgradeInsecureRequests: [], // Redirige HTTP vers HTTPS si possible
            },
        },
        // Autres options de Helmet (gardent les valeurs par défaut sécurisées)
        crossOriginEmbedderPolicy: false, // Peut causer des problèmes avec certaines ressources externes
        crossOriginResourcePolicy: { policy: "same-site" }, // Contrôle le partage de ressources cross-origin
    })
);

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
    article_id INTEGER NOT NULL,            -- L'ID de l'article auquel il est lié
    author_name TEXT NOT NULL,              -- Le nom de l'auteur du commentaire
    content TEXT NOT NULL,                  -- Le contenu du commentaire
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- La date de création
    is_approved INTEGER DEFAULT 0,          -- 0 = En attente, 1 = Approuvé
    FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
);
`;
db.run(createCommentsTable, (err) => {
    if (err) console.error("Erreur création table comments:", err);
})


// =================================================================
// 5. FONCTION HELPER POUR LES TAGS
// =================================================================
async function processTags(articleId, tagIds) {
    // Utilisation de Promesses pour un meilleur contrôle asynchrone
    const deleteLinks = (artId) => new Promise((resolve, reject) => {
        db.run('DELETE FROM article_tags WHERE article_id = ?', [artId], (err) => err ? reject(err) : resolve());
    });

    const insertLinks = (artId, ids) => new Promise((resolve, reject) => {
        // Ne fait rien si aucun tag n'est sélectionné
        if (!ids || ids.length === 0) return resolve();

        // S'assure que les IDs sont bien des nombres valides (sécurité)
        const validIds = ids.filter(id => typeof id === 'number' && !isNaN(id));
        if (validIds.length === 0) return resolve();

        // Crée les placeholders et les valeurs pour l'insertion multiple
        const placeholders = validIds.map(() => '(?, ?)').join(',');
        const values = validIds.reduce((acc, tagId) => acc.concat([artId, tagId]), []);
        const sql = `INSERT INTO article_tags (article_id, tag_id) VALUES ${placeholders}`;

        db.run(sql, values, (err) => err ? reject(err) : resolve());
    });

    try {
        // 1. Supprime les anciens liens pour cet article
        await deleteLinks(articleId);
        // 2. Ajoute les nouveaux liens basés sur les IDs reçus
        await insertLinks(articleId, tagIds);
    } catch (error) {
        console.error(`Erreur dans processTags pour article ${articleId}:`, error);
        throw error; // Relance l'erreur pour qu'elle soit attrapée par la route appelante
    }
}

// =================================================================
// NOUVEAU : FONCTION HELPER POUR NOTIFICATION ADMIN
// =================================================================
async function sendAdminNotification(req, articleId, commentId, authorName, commentContent) {
    // Vérifie si l'envoi d'email est configuré
    if (!transporter) {
        console.warn("[sendAdminNotification] Nodemailer non configuré. Notification admin non envoyée.");
        return; // Ne fait rien si le transporter n'est pas prêt
    }

    try {
        // 1. Récupérer le titre de l'article pour le contexte
        const sqlGetArticle = `SELECT title_fr FROM articles WHERE id = ?`;
        const article = await new Promise((resolve, reject) => {
            db.get(sqlGetArticle, [articleId], (err, row) => err ? reject(err) : resolve(row));
        });
        const articleTitle = article ? article.title_fr : "un article"; // Fallback

        // 2. Construire un lien direct vers la page de modération
        const protocol = req.protocol; // http ou https (si sur Render avec HTTPS)
        const host = req.get('host'); // localhost:3000 ou mon-site.onrender.com
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

// Page de détail d'une entrée (avec tags, parsing, nav, et commentaires)
app.get('/entree/:id', (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { return res.status(400).send("ID d'entrée invalide."); }

    const lang = req.language === 'en' ? 'en' : 'fr';

    // Requête pour l'article actuel
    const sqlArticle = `SELECT *, title_${lang} as title, content_${lang} as content FROM articles WHERE id = ?`;
    // Requête pour les tags de l'article actuel
    const sqlTags = `SELECT t.name_${lang} as name FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?`;
    // NOUVELLE REQUÊTE : Récupérer les commentaires approuvés
    const sqlComments = `SELECT author_name, content, created_at FROM comments WHERE article_id = ? AND is_approved = 1 ORDER BY created_at ASC`;

    // Requêtes pour Précédent/Suivant (basées sur la date)
    // Note: On a besoin de la date de l'article actuel d'abord
    db.get(sqlArticle, id, (err, article) => {
        if (err) { console.error(`Erreur BDD (GET /entree/${id} article):`, err); return res.status(500).send("Erreur serveur."); }
        if (!article) { return res.status(404).send("Entrée non trouvée !"); }

        // Maintenant qu'on a l'article (et sa date), on cherche Précédent/Suivant
        const currentPublicationDate = article.publication_date;
        const sqlPrev = `SELECT id, title_${lang} as title FROM articles WHERE publication_date < ? ORDER BY publication_date DESC LIMIT 1`;
        const sqlNext = `SELECT id, title_${lang} as title FROM articles WHERE publication_date > ? ORDER BY publication_date ASC LIMIT 1`;

        // On exécute les 4 requêtes restantes en parallèle
        Promise.all([
            new Promise((resolve, reject) => db.all(sqlTags, id, (errTags, tagRows) => errTags ? reject(errTags) : resolve(tagRows))),
            new Promise((resolve, reject) => db.get(sqlPrev, [currentPublicationDate], (errPrev, prevRow) => errPrev ? reject(errPrev) : resolve(prevRow))),
            new Promise((resolve, reject) => db.get(sqlNext, [currentPublicationDate], (errNext, nextRow) => errNext ? reject(errNext) : resolve(nextRow))),
            new Promise((resolve, reject) => db.all(sqlComments, id, (err, rows) => err ? reject(err) : resolve(rows))) // 4. Ajout de la requête commentaires
        ]).then(([tagRows, prevEntry, nextEntry, comments]) => {
            
            article.tags = tagRows.map(tag => tag.name);

            const ogDescription = article.content
                .replace(/!\[.*?\]\(.*?\)/g, '') // Enlève les images Markdown
                .replace(/[#*`~_]/g, '') // Enlève les symboles Markdown
                .replace(/\s+/g, ' ') // Remplace les espaces multiples par un seul
                .substring(0, 155)
                .trim() + '...';

            // 2. Détermine l'image de couverture
            let ogImage = article.cover_image_url;
            if (!ogImage) {
                const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                ogImage = match ? match[1] : null;
            }

            // 3. Construit l'URL ABSOLUE de l'image
            // IMPORTANT: Remplace 'https://mon-stage-au-nom-de-pays.onrender.com' par ton URL
            const siteBaseUrl = 'https://mon-stage-au-nom-de-pays.onrender.com';
            let absoluteOgImage = `${siteBaseUrl}/default-banner.png`; // Image par défaut
            if (ogImage) {
                if (ogImage.startsWith('http')) {
                    absoluteOgImage = ogImage; // C'est déjà une URL absolue
                } else {
                    absoluteOgImage = `${siteBaseUrl}${ogImage}`; // C'est une URL locale (ex: /uploads/...)
                }
            }

            // Nettoyage du contenu (enlève le H1 si présent)
            let finalContent = article.content;
            const markdownTitle = '# ' + article.title;
            if (finalContent && finalContent.trim().startsWith(markdownTitle)) {
                finalContent = finalContent.substring(markdownTitle.length).trim();
            }
            // Parse le contenu nettoyé
            try {
                article.content = marked.parse(finalContent || '');
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
                comments: comments || [], // 4. Passe les commentaires à la vue
                messageSent: req.query.comment === 'success' ? true : (req.query.comment === 'error' ? false : null), // Pour le feedback du formulaire

                // --- AJOUT DES VARIABLES OG ---
                ogTitle: article.title,
                ogDescription: ogDescription,
                ogImage: absoluteOgImage,
                ogType: 'article' // Type spécifique pour les entrées de journal
            });

        }).catch(promiseErr => {
            console.error(`Erreur BDD (GET /entree/${id} tags/prev/next):`, promiseErr);
            res.status(500).send("Erreur serveur lors de la récupération des données.");
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
app.post('/connexion', authLimiter, (req, res) => {
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

app.post('/inscription', checkAdminExists, authLimiter, (req, res) => {
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

app.post('/forgot-password', authLimiter, async (req, res) => {
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

app.post('/reset-password/:token', authLimiter, (req, res) => {
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

app.post('/change-password', isAuthenticated, authLimiter, async (req, res) => {
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
app.post('/upload-image', isAuthenticated, apiLimiter, upload.single('image'), async (req, res) => {
    if (!req.file) { 
        return res.status(400).json({ error: 'Aucun fichier reçu.' }); 
    }

    const originalPath = req.file.path; // Chemin du fichier original (ex: public/uploads/12345.jpg)
    const originalFilename = req.file.filename; // Nom de fichier original
    // On crée un nouveau nom de fichier pour la version optimisée (ex: 12345-opt.webp)
    const optimizedFilename = originalFilename.replace(/(\.[\w\d_-]+)$/i, '-opt.webp');
    const optimizedPath = path.join('public', 'uploads', optimizedFilename); // Chemin complet pour la sauvegarde

    console.log(`[Sharp] Traitement de ${originalFilename} vers ${optimizedFilename}`);

    try {
        // 2. Traitement avec Sharp
        await sharp(originalPath)
            .resize({ width: 1200, withoutEnlargement: true }) // Redimensionne si > 1200px de large, sans agrandir les petites images
            .webp({ quality: 80 }) // Convertit en WebP avec 80% de qualité (bon compromis)
            .toFile(optimizedPath); // Sauvegarde l'image optimisée

        console.log(`[Sharp] Image optimisée sauvegardée : ${optimizedPath}`);

        // 3. Optionnel : Supprimer l'image originale (économise de l'espace)
        fs.unlink(originalPath, (err) => {
            if (err) console.error(`[Sharp] Erreur suppression original ${originalPath}:`, err);
            else console.log(`[Sharp] Image originale supprimée : ${originalPath}`);
        });

        // 4. Renvoyer l'URL de l'image OPTIMISÉE
        const optimizedImageUrl = '/uploads/' + optimizedFilename;
        res.json({ imageUrl: optimizedImageUrl });
    
    } catch (error) {
        console.error("[Sharp] Erreur lors de l'optimisation de l'image:", error);
        // Si l'optimisation échoue, on pourrait renvoyer l'original ou une erreur
        // Pour l'instant, on renvoie une erreur serveur
        // On pourrait aussi essayer de supprimer l'original si l'optimisation plante
        try { fs.unlinkSync(originalPath); } catch (e) {} // Tentative de nettoyage
        res.status(500).json({ error: "Erreur lors du traitement de l'image." });
    }
});

// --- FORMULAIRE CONTACT ---
app.post('/contact', contactLimiter, (req, res) => { 
    if (!transporter) {
        console.error("Tentative d'envoi via /contact alors que Nodemailer n'est pas configuré.");
        return res.status(503).render('contact', {
            pageTitle: req.t('page_titles.contact'),
            activePage: 'contact',
            messageSent: false, // Indique une erreur
            error: req.t('contact.error_message') // Message d'erreur générique
        });
    }

    const { name, email, message } = req.body;

    if (!name || !email || !message || !email.includes('@')) {
        console.warn("Validation échouée pour le formulaire de contact:", { name, email, message });
        return res.status(400).render('contact', {
            pageTitle: req.t('page_titles.contact'),
            activePage: 'contact',
            messageSent: false,
            error: "Veuillez remplir tous les champs correctement." // Message d'erreur spécifique
        });
    }

    const mailOptions = {
        from: `"${name}" <${process.env.EMAIL_USER}>`, // L'expéditeur affiché sera ton compte Gmail
        replyTo: email, // Permet de répondre directement à l'expéditeur via le bouton "Répondre"
        to: process.env.EMAIL_TO, // L'adresse où tu reçois les messages
        subject: `Nouveau message de ${name} via le Carnet de Stage`, // Sujet de l'email
        // Corps de l'email en texte brut (pour les clients mail simples)
        text: `Nom: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        // Corps de l'email en HTML (pour un meilleur formatage)
        html: `
            <p><strong>Nom :</strong> ${name}</p>
            <p><strong>Email :</strong> ${email}</p>
            <hr>
            <p><strong>Message :</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p> <%# Convertit les sauts de ligne en <br> pour HTML %>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        let messageStatus = null; // Variable pour le feedback sur la page
        if (error) {
            console.error("Erreur lors de l'envoi de l'email via /contact:", error);
            messageStatus = false; // Indique un échec
        } else {
            console.log('Email de contact envoyé: ' + info.response);
            messageStatus = true; // Indique un succès
        }
        res.render('contact', {
            pageTitle: req.t('page_titles.contact'),
            activePage: 'contact',
            messageSent: messageStatus, // true ou false
            error: !messageStatus ? req.t('contact.error_message') : null // Affiche l'erreur si échec
        });
    });
});


// --- GESTION DU CONTENU (ROUTES PROTÉGÉES) ---

// Affiche le formulaire de création (avec la liste des tags)
app.get('/journal/nouvelle', isAuthenticated, (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr'; // Pour afficher les noms des tags
    // Récupère tous les tags existants
    const sqlTags = `SELECT id, name_${lang} as name FROM tags ORDER BY name_${lang} ASC`;

    db.all(sqlTags, [], (err, allTags) => {
        if (err) {
            console.error("Erreur BDD (GET /journal/nouvelle tags):", err);
            // Gérer l'erreur, peut-être afficher le formulaire sans tags ?
            allTags = []; // Fallback
        }
        res.render('new_entry', {
            pageTitle: req.t('page_titles.new_entry'),
            activePage: 'journal',
            allTags: allTags, // Passe la liste de tous les tags
            articleTags: []   // Pas de tags pré-sélectionnés pour une nouvelle entrée
        });
    });
});


// Traite la création d'une entrée (avec sélection de tags par ID)
app.post('/journal', isAuthenticated, async (req, res) => {
    const { title_fr, title_en, content_fr, content_en, cover_image_url } = req.body;
    const userId = req.session.userId;

    // --- RÉCUPÉRATION DES IDs DES TAGS ---
    let tagIds = req.body.tags; // Peut être undefined, un seul ID (string), ou un tableau d'IDs (string[])
    if (tagIds === undefined) {
        tagIds = []; // Si rien n'est coché, tableau vide
    } else if (!Array.isArray(tagIds)) {
        tagIds = [tagIds]; // Si une seule case est cochée, le met dans un tableau
    }
    // Convertit les IDs (qui arrivent en string) en nombres entiers
    tagIds = tagIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    // --- FIN RÉCUPÉRATION ---

    const sqlInsertArticle = 'INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id, cover_image_url) VALUES (?, ?, ?, ?, ?, ?)';

    db.run(sqlInsertArticle, [title_fr, title_en, content_fr, content_en, userId, cover_image_url], async function(err) {
        if (err) { console.error("Erreur BDD (POST /journal insert):", err); return res.status(500).send("Erreur serveur."); }
        const articleId = this.lastID;
        try  {
            // Passe le tableau d'IDs directement
            await processTags(articleId, tagIds);
            res.redirect('/journal');
        } catch (tagError) {
            console.error("Erreur traitement tags (création):", tagError);
            res.status(500).send("Erreur tags.");
        }
    })
})


// Affiche le formulaire de modification (avec tous les tags et les tags actuels)
app.get('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sqlArticle = "SELECT * FROM articles WHERE id = ?"; // Récupère l'article complet
    const sqlArticleTags = `SELECT tag_id FROM article_tags WHERE article_id = ?`; // IDs des tags liés
    const sqlAllTags = `SELECT id, name_${lang} as name FROM tags ORDER BY name_${lang} ASC`; // Tous les tags

    // Utilise Promise.all pour exécuter les requêtes en parallèle
    Promise.all([
        new Promise((resolve, reject) => db.get(sqlArticle, id, (err, row) => err ? reject(err) : resolve(row))),new Promise((resolve, reject) => db.get(sqlArticle, id, (err, row) => err ? reject(err) : resolve(row))),
        new Promise((resolve, reject) => db.all(sqlArticleTags, id, (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.all(sqlAllTags, [], (err, rows) => err ? reject(err) : resolve(rows)))
    ]).then(([article, articleTagRows, allTags]) => {
        if (!article) { return res.status(404).send("Entrée non trouvée !"); }

        // Crée un Set des IDs des tags actuellement liés pour une recherche rapide
        const articleTagIds = new Set(articleTagRows.map(row => row.tag_id));

        res.render('edit_entry', {
            article: article, // Contient title_fr, content_fr etc.
            pageTitle: `${req.t('page_titles.edit_entry')}: ${article.title_fr}`,
            activePage: 'journal',
            allTags: allTags,          // Tous les tags disponibles
            articleTagIds: articleTagIds // Les IDs des tags actuellement cochés
        });
    }).catch(err => {
        console.error(`Erreur BDD (GET /entree/${id}/edit combined):`, err);
        res.status(500).send("Erreur serveur lors de la récupération des données.");
    });
});

// Traite la modification d'une entrée (avec sélection de tags par ID)
app.post('/entree/:id/edit', isAuthenticated, async (req, res) => {
    const id = req.params.id; // ID de l'article
    const { title_fr, title_en, content_fr, content_en, cover_image_url } = req.body;

    // --- RÉCUPÉRATION DES IDs DES TAGS (Identique à la création) ---
    let tagIds = req.body.tags;
    if (tagIds === undefined) { tagIds = []; }
    else if (!Array.isArray(tagIds)) { tagIds = [tagIds]; }
    tagIds = tagIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    // --- FIN RÉCUPÉRATION ---

    const sqlUpdateArticle = 'UPDATE articles SET title_fr = ?, title_en = ?, content_fr = ?, content_en = ?, cover_image_url = ? WHERE id = ?';

    db.run(sqlUpdateArticle, [title_fr, title_en, content_fr, content_en, cover_image_url, id], async function(err) {
        if (err) { console.error(`Erreur BDD (POST /entree/${id}/edit update):`, err); return res.status(500).send("Erreur serveur."); }
        try {
            // Passe le tableau d'IDs directement
            await processTags(id, tagIds);
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

// --- GESTION DES TAGS (Admin) ---
app.get('/admin/tags', isAuthenticated, (req, res) => {
    // Récupère tous les tags depuis la base de données
    const sql = 'SELECT * FROM tags ORDER BY name_fr ASC';
    db.all(sql, [], (err, tags) => {
        if (err) {
            console.error("Erreur BDD (GET /admin/tags):", err);
            return res.status(500).send("Erreur serveur lors de la récupération des tags.");
        }

        const message = req.session.flashMessage;
        req.session.flashMessage = null; // Efface après lecture

        res.render('admin-tags', {
            pageTitle: 'Gérer les Tags',
            activePage: 'admin',
            tags: tags, // Passe la liste des tags à la vue
            message: message // Pour afficher les messages de succès/erreur
        });
    });
});

// --- GESTION DES COMMENTAIRES (Admin) ---
app.get('/admin/comments', isAuthenticated, (req, res) => {
    // Récupère les commentaires en attente
    const sqlPending = `
        SELECT c.id, c.author_name, c.content, c.created_at, a.title_fr as article_title, a.id as article_id
        FROM comments c
        JOIN articles a ON c.article_id = a.id
        WHERE c.is_approved = 0
        ORDER BY c.created_at ASC
    `;
    // Récupère les commentaires déjà approuvés
    const sqlApproved = `
        SELECT c.id, c.author_name, c.content, c.created_at, a.title_fr as article_title, a.id as article_id
        FROM comments c
        JOIN articles a ON c.article_id = a.id
        WHERE c.is_approved = 1
        ORDER BY c.created_at DESC
    `;

    // Utilise Promise.all pour exécuter les deux requêtes
    Promise.all([
        new Promise((resolve, reject) => db.all(sqlPending, [], (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.all(sqlApproved, [], (err, rows) => err ? reject(err) : resolve(rows)))
    ]).then(([pendingComments, approvedComments]) => {
        res.render('admin-comments', {
            pageTitle: req.t('admin_page.manage_comments_title'),
            activePage: 'admin',
            pendingComments: pendingComments,
            approvedComments: approvedComments,
            message: req.session.flashMessage // Pour les messages de succès/erreur
        });
        req.session.flashMessage = null; // Efface le message après l'avoir affiché
    }).catch(err => {
        console.error("Erreur BDD (GET /admin/comments):", err);
        res.status(500).send("Erreur serveur lors de la récupération des commentaires.");
    });
});

// NOUVEAU : Traite l'approbation d'un commentaire
app.post('/admin/comments/approve/:id', isAuthenticated, (req, res) => {
    const commentId = req.params.id;

    const sql = 'UPDATE comments SET is_approved = 1 WHERE id = ?';

    db.run(sql, [commentId], function(err) {
        if (err) {
            console.error(`Erreur BDD (POST /admin/comments/approve/${commentId}):`, err);
            req.session.flashMessage = { type: 'error', text: 'Erreur lors de l\'approbation du commentaire.' };
        } else {
            req.session.flashMessage = { type: 'success', text: `Commentaire #${commentId} approuvé.` };
        }
        res.redirect('/admin/comments'); // Redirige vers la page de modération
    });
});

// NOUVEAU : Traite la suppression d'un commentaire
app.post('/admin/comments/delete/:id', isAuthenticated, (req, res) => {
    const commentId = req.params.id;

    const sql = 'DELETE FROM comments WHERE id = ?';

    db.run(sql, [commentId], function(err) {
        if (err) {
            console.error(`Erreur BDD (POST /admin/comments/delete/${commentId}):`, err);
            req.session.flashMessage = { type: 'error', text: 'Erreur lors de la suppression du commentaire.' };
        } else {
            req.session.flashMessage = { type: 'success', text: `Commentaire #${commentId} supprimé.` };
        }
        res.redirect('/admin/comments'); // Redirige vers la page de modération
    });
});

// Traite la mise à jour d'un tag (nom anglais)
app.post('/admin/tags/update/:id', isAuthenticated, (req, res) => {
    const tagId = req.params.id;
    const newNameEn = req.body.name_en;

    if (!newNameEn) {
        req.session.flashMessage = { type: 'error', text: 'Le nom anglais ne peut pas être vide.' };
        return res.redirect('/admin/tags');
    }

    const sql = 'UPDATE tags SET name_en = ? WHERE id = ?';
    db.run(sql, [newNameEn, tagId], function(err) {
        let message;
        if (err) {
            console.error(`Erreur BDD (POST /admin/tags/update/${tagId}):`, err);
            message = { type: 'error', text: 'Erreur lors de la mise à jour du tag. Le nom anglais existe peut-être déjà.' };
        } else {
            message = { type: 'success', text: `Tag #${tagId} mis à jour avec succès.` };
        }
        req.session.flashMessage = message;
        res.redirect('/admin/tags');
    })
})

// Traite la création d'un nouveau tag (avec traduction auto)
app.post('/admin/tags/create', isAuthenticated, async (req, res) => { // Ajout de async
    const name_fr = req.body.name_fr; // On récupère seulement le nom FR
    // On ignore req.body.name_en pour l'instant, car on va le générer

    if (!name_fr) {
        req.session.flashMessage = { type: 'error', text: 'Le nom français est requis.' };
        return res.redirect('/admin/tags');
    }

    let name_en = name_fr; // Valeur par défaut

    // --- Traduction via DeepL ---
    if (translator) { // Vérifie si le client DeepL est initialisé
        try {
            console.log(`[Tag Create] Traduction de "${name_fr}" vers EN...`);
            const result = await translator.translateText(name_fr, 'fr', 'en-GB');
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
    // --- Fin Traduction ---

    // Insertion dans la base de données avec les deux noms
    const sql = 'INSERT INTO tags (name_fr, name_en) VALUES (?, ?)';
    db.run(sql, [name_fr, name_en], function(err) {
        let message;
        if (err) {
            console.error("Erreur BDD (POST /admin/tags/create):", err);
            if (err.message.includes('UNIQUE constraint failed')) {
                message = { type: 'error', text: 'Un tag avec ce nom (FR ou EN) existe déjà.' };
            } else {
                message = { type: 'error', text: 'Erreur lors de la création du tag.' };
            }
        } else {
            message = { type: 'success', text: `Tag "${name_fr}" / "${name_en}" créé avec succès.` };
        }
        req.session.flashMessage = message;
        res.redirect('/admin/tags');
    });
});

app.post('/admin/tags/delete/:id', isAuthenticated, (req, res) => {
    const tagId = req.params.id;
    // ON DELETE CASCADE dans la table article_tags gère la suppression des liens
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

app.post('/article/:id/comment', commentLimiter, (req, res) => {
    const articleId = req.params.id;
    const { author_name, content } = req.body;

    // 1. Validation simple des données
    if (!author_name || !content || author_name.trim() === '' || content.trim() === '') {
        console.warn("Validation du commentaire échouée : champs vides.");
        return res.redirect(`/entree/${articleId}?comment=error`);
    }

    // 2. Insertion dans la base de données
    const sql = `
        INSERT INTO comments (article_id, author_name, content, is_approved)
        VALUES (?, ?, ?, 0)
    `;
    // is_approved est mis à 0 (en attente) par défaut

    db.run(sql, [articleId, author_name, content], function(err) {
        if (err) {
            console.error("Erreur BDD (POST /article/:id/comment):", err);
            return res.redirect(`/entree/${articleId}?comment=error`);
        }

        // --- APPEL DE LA NOTIFICATION ---
        // On récupère l'ID du commentaire qui vient d'être créé
        const newCommentId = this.lastID;
        // On appelle la fonction de notification (sans 'await' pour ne pas bloquer l'utilisateur)
        sendAdminNotification(req, articleId, newCommentId, author_name, content);
        // --- FIN DE L'APPEL ---

        // 3. Succès ! Redirige avec un message de succès
        console.log(`Nouveau commentaire créé (ID: ${this.lastID}) pour l'article ${articleId}, en attente de modération.`);
        res.redirect(`/entree/${articleId}?comment=success`);
    })
});

// =================================================================
// 7. EXPORT DE L'APPLICATION
// =================================================================
module.exports = { app, db }; // Exporte l'app et la BDD pour les tests