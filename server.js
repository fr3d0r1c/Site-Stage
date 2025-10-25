// =================================================================
// 1. IMPORTS (DÉPENDANCES)
// =================================================================
// require('dotenv').config(); // Pour lire le .env (si utilisé pour la clé DeepL par ex.)
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { marked } = require('marked'); // Pour convertir le Markdown
const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const FsBackend = require('i18next-fs-backend');

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

// --- CONFIGURATION i18n (POUR DÉTECTION DE LANGUE) ---
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

// Middleware pour i18next
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
    if (req.originalUrl.startsWith('/upload-image')) {
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

const createArticleTable = `
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_fr TEXT NOT NULL,
  title_en TEXT NOT NULL,
  content_fr TEXT NOT NULL,
  content_en TEXT NOT NULL,
  cover_image_url TEXT,
  publication_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users (id)
);
`;
db.run(createArticleTable);

// Création de la table 'users'
const createUserTable = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
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
  article_id INTEGER,
  tag_id INTEGER,
  FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);
`;
db.run(createArticleTagsTable);

// =================================================================
// 5. ROUTES
// =================================================================

// --- PAGES PUBLIQUES (LECTURE) ---

// Page d'accueil
// Page d'accueil
app.get('/', (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';
    // Requête pour récupérer les 3 derniers articles avec leurs tags concaténés
    const sql = `
        SELECT
            a.id, a.title_${lang} as title, a.content_${lang} as content,
            a.cover_image_url, a.publication_date,
            GROUP_CONCAT(t.name) as tags
        FROM articles a
        LEFT JOIN article_tags at ON a.id = at.article_id
        LEFT JOIN tags t ON at.tag_id = t.id
        GROUP BY a.id
        ORDER BY a.publication_date DESC
        LIMIT 3
    `;
    db.all(sql, [], (err, rows) => {
        if (err) { return res.status(500).send("Erreur BDD"); }

        const articlesWithData = rows.map(article => {
            const tagList = article.tags ? article.tags.split(',') : []; // Transforme la chaîne de tags en tableau
            let finalCoverImage = null;
            if (article.cover_image_url) { finalCoverImage = article.cover_image_url; }
            else { const match = article.content.match(/!\[.*?\]\((.*?)\)/); finalCoverImage = match ? match[1] : null; }
            const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
            return { ...article, tags: tagList, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
        });

        res.render('index', { articles: articlesWithData, pageTitle: req.t('nav.home'), activePage: 'accueil' });
    });
});

// Pages statiques
app.get('/profil', (req, res) => {
    res.render('profil', { pageTitle: req.t('nav.profile'), activePage: 'profil' });
});

app.get('/stage', (req, res) => {
    res.render('stage', { pageTitle: req.t('nav.internship'), activePage: 'stage' });
});

// Page de tout le journal (avec pagination et tags)
app.get('/journal', (req, res) => {
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const lang = req.language === 'en' ? 'en' : 'fr';

    // Requête pour les entrées de la page actuelle avec tags
    const sqlEntries = `
        SELECT
            a.id, a.title_${lang} as title, a.content_${lang} as content,
            a.cover_image_url, a.publication_date,
            GROUP_CONCAT(t.name) as tags
        FROM articles a
        LEFT JOIN article_tags at ON a.id = at.article_id
        LEFT JOIN tags t ON at.tag_id = t.id
        GROUP BY a.id
        ORDER BY a.publication_date DESC
        LIMIT ? OFFSET ?
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
                articles: articlesWithData,
                pageTitle: req.t('nav.journal'),
                activePage: 'journal',
                currentPage: currentPage,
                totalPages: totalPages
            });
        });
    });
});

// Page de détail d'une entrée
// Page de détail d'une entrée (avec tags)
app.get('/entree/:id', (req, res) => {
    const id = req.params.id;
    const lang = req.language === 'en' ? 'en' : 'fr';
    
    // Requête pour l'article dans la bonne langue
    const sqlArticle = `
        SELECT id, title_${lang} as title, content_${lang} as content, cover_image_url, publication_date
        FROM articles WHERE id = ?
    `;
    // Requête séparée pour les tags de cet article
    const sqlTags = `
        SELECT t.name FROM tags t
        JOIN article_tags at ON t.id = at.tag_id
        WHERE at.article_id = ?
    `;

    // Exécute la première requête
    db.get(sqlArticle, id, (err, article) => {
        if (err) { return res.status(500).send("Erreur BDD article"); }
        if (!article) { return res.status(404).send("Entrée non trouvée !"); }

        // Exécute la deuxième requête
        db.all(sqlTags, id, (errTags, tagRows) => {
            if (errTags) { return res.status(500).send("Erreur BDD tags"); }

            // Ajoute le tableau de noms de tags à l'objet article
            article.tags = tagRows.map(tag => tag.name); 

            // Nettoyage du contenu (enlève le H1 si présent)
            let finalContent = article.content;
            const markdownTitle = '# ' + article.title;
            if (finalContent.trim().startsWith(markdownTitle)) {
                finalContent = finalContent.substring(markdownTitle.length).trim();
            }

            // Parse le contenu nettoyé
            article.content = marked.parse(finalContent); 
            
            // Envoie le tout à la vue
            res.render('entry_detail', { 
                article: article, // Contient maintenant article.tags
                pageTitle: article.title, 
                activePage: 'journal' 
            });
        });
    });
});

// --- RECHERCHE ---
// --- RECHERCHE ---
app.get('/search', (req, res) => {
    const query = req.query.query;
    const lang = req.language === 'en' ? 'en' : 'fr';

    if (!query) {
        return res.render('search_results', {
            articles: [], query: '', pageTitle: 'Recherche', activePage: 'search'
        });
    }
    const searchTerm = `%${query}%`;

    // Requête de recherche incluant les tags
    const sql = `
        SELECT
            a.id, a.title_${lang} as title, a.content_${lang} as content,
            a.cover_image_url, a.publication_date,
            GROUP_CONCAT(t.name) as tags
        FROM articles a
        LEFT JOIN article_tags at ON a.id = at.article_id
        LEFT JOIN tags t ON at.tag_id = t.id
        WHERE
            a.title_fr LIKE ? OR
            a.title_en LIKE ? OR
            a.content_fr LIKE ? OR
            a.content_en LIKE ?
        GROUP BY a.id
        ORDER BY a.publication_date DESC
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

        res.render('search_results', {
            articles: articlesWithData, query: query, pageTitle: `Résultats pour "${query}"`, activePage: 'search'
        });
    });
});

// --- AUTHENTIFICATION ET API ---

// Affiche le formulaire de connexion
app.get('/connexion', (req, res) => {
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) { return res.status(500).send("Erreur serveur"); }
        res.render('login', { pageTitle: req.t('general.page_title_login'), error: null, adminExists: row.count > 0, activePage: 'admin' });
    });
});

// Traite la tentative de connexion
app.post('/connexion', (req, res) => {
    const { username, password } = req.body;
    const sql = 'SELECT * FROM users WHERE username = ?';
    db.get(sql, [username], (err, user) => {
        if (err) { return res.status(500).send("Erreur du serveur."); }
        if (!user) {
            return res.render('login', { pageTitle: req.t('general.page_title_login'), error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin' });
        }
        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.userId = user.id;
                req.session.username = user.username;
                res.redirect('/');
            } else {
                res.render('login', { pageTitle: req.t('general.page_title_login'), error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin' });
            }
        });
    });
});

// Route de déconnexion
app.get('/deconnexion', (req, res) => {
    req.session.destroy(err => {
        if (err) { return res.redirect('/'); }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Affiche le formulaire d'inscription (conditionnel)
app.get('/inscription', checkAdminExists, (req, res) => {
    res.render('register', { pageTitle: req.t('general.page_title_register'), activePage: 'admin' });
});

// Traite la création du premier admin
app.post('/inscription', checkAdminExists, (req, res) => {
    const { username, password } = req.body;
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) { return res.status(500).send("Erreur hachage."); }
        const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
        db.run(sql, [username, hash], function(err) {
            if (err) { return res.status(400).send("Erreur création compte."); }
            res.redirect('/connexion');
        });
    });
});

// Endpoint d'API pour l'upload d'images
app.post('/upload-image', isAuthenticated, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier reçu.' });
    }
    const imageUrl = '/uploads/' + req.file.filename;
    res.json({ imageUrl: imageUrl });
});

// --- GESTION DU CONTENU (ROUTES PROTÉGÉES) ---

// Affiche le formulaire de création
app.get('/journal/nouvelle', isAuthenticated, (req, res) => {
    res.render('new_entry', { pageTitle: req.t('general.page_title_new_entry'), activePage: 'journal' });
});

// Traite la création d'une entrée (avec tags)
app.post('/journal', isAuthenticated, async (req, res) => { // Ajout de async
    const { title_fr, title_en, content_fr, content_en, cover_image_url, tags } = req.body;
    const userId = req.session.userId;
    const tagNames = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : []; // Nettoie la liste des tags

    const sqlInsertArticle = 'INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id, cover_image_url) VALUES (?, ?, ?, ?, ?, ?)';

    db.run(sqlInsertArticle, [title_fr, title_en, content_fr, content_en, userId, cover_image_url], async function(err) { // Ajout de async
        if (err) { return res.status(500).send("Erreur création entrée."); }

        const articleId = this.lastID; // Récupère l'ID de l'article créé

        try {
            // Fonction pour gérer les tags (voir ci-dessous)
            await processTags(articleId, tagNames); 
            res.redirect('/journal');
        } catch (tagError) {
            console.error("Erreur lors du traitement des tags:", tagError);
            res.status(500).send("Erreur lors de l'ajout des tags.");
        }
    });
});

// --- NOUVELLE FONCTION HELPER pour gérer les tags ---
async function processTags(articleId, tagNames) {
    // 1. Récupère ou crée les IDs pour chaque nom de tag
    const tagIds = [];
    for (const name of tagNames) {
        // Essaie de trouver le tag
        let tag = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM tags WHERE name = ?', [name], (err, row) => err ? reject(err) : resolve(row));
        });

        if (!tag) { // S'il n'existe pas, on le crée
             tag = await new Promise((resolve, reject) => {
                 db.run('INSERT INTO tags (name) VALUES (?)', [name], function(err) {
                     err ? reject(err) : resolve({ id: this.lastID });
                 });
             });
        }
        tagIds.push(tag.id);
    }

    // 2. Supprime les anciens liens pour cet article
    await new Promise((resolve, reject) => {
         db.run('DELETE FROM article_tags WHERE article_id = ?', [articleId], (err) => err ? reject(err) : resolve());
    });

    // 3. Crée les nouveaux liens
    if (tagIds.length > 0) {
        const placeholders = tagIds.map(() => '(?, ?)').join(',');
        const values = tagIds.reduce((acc, tagId) => acc.concat([articleId, tagId]), []);
        const sqlInsertLinks = `INSERT INTO article_tags (article_id, tag_id) VALUES ${placeholders}`;
        await new Promise((resolve, reject) => {
            db.run(sqlInsertLinks, values, (err) => err ? reject(err) : resolve());
        });
    }
}

// Affiche le formulaire de modification (bilingue + tags)
app.get('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    // Requête pour l'article complet (toutes les langues pour l'édition)
    const sqlArticle = "SELECT * FROM articles WHERE id = ?";
    // Requête séparée pour les tags
    const sqlTags = `
        SELECT t.name FROM tags t
        JOIN article_tags at ON t.id = at.tag_id
        WHERE at.article_id = ?
    `;

    db.get(sqlArticle, id, (err, article) => {
        if (err) { return res.status(500).send("Erreur BDD article"); }
        if (!article) { return res.status(404).send("Entrée non trouvée !");}

        db.all(sqlTags, id, (errTags, tagRows) => {
            if (errTags) { return res.status(500).send("Erreur BDD tags"); }

            // Transforme le tableau d'objets [{name: 'tag1'}, ...] en chaîne "tag1, tag2"
            const tagString = tagRows.map(tag => tag.name).join(', ');
            article.tags = tagString; // Ajoute la chaîne de tags à l'objet article

            res.render('edit_entry', {
                article: article, // Contient maintenant article.tags
                pageTitle: `${req.t('general.page_title_edit_entry')}: ${article.title_fr}`,
                activePage: 'journal'
            });
        });
    });
});

// Traite la modification d'une entrée (avec tags)
app.post('/entree/:id/edit', isAuthenticated, async (req, res) => { // Ajout de async
    const id = req.params.id;
    const { title_fr, title_en, content_fr, content_en, cover_image_url, tags } = req.body;
    const tagNames = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

    const sqlUpdateArticle = 'UPDATE articles SET title_fr = ?, title_en = ?, content_fr = ?, content_en = ?, cover_image_url = ? WHERE id = ?';

    db.run(sqlUpdateArticle, [title_fr, title_en, content_fr, content_en, cover_image_url, id], async function(err) { // Ajout de async
        if (err) { return res.status(500).send("Erreur mise à jour entrée."); }

        try {
            // On réutilise la même fonction pour mettre à jour les tags
            await processTags(id, tagNames);
            res.redirect('/journal');
        } catch (tagError) {
            console.error("Erreur lors du traitement des tags:", tagError);
            res.status(500).send("Erreur lors de la mise à jour des tags.");
        }
    });
});

// Traite la suppression d'une entrée
app.post('/entree/:id/delete', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM articles WHERE id = ?';
    db.run(sql, id, function(err) {
        if (err) { return res.status(500).send("Erreur suppression entrée."); }
        res.redirect('/journal');
    });
});

// =================================================================
// 6. DÉMARRAGE DU SERVEUR
// =================================================================
app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});