// =================================================================
// 1. IMPORTS (DÉPENDANCES)
// =================================================================
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { marked } = require('marked'); // Pour convertir le Markdown
const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const FsBackend = require('i18next-fs-backend');
const ITEMS_PER_PAGE = 5; // Nombre d'entrées par page

// =================================================================
// 2. INITIALISATION ET CONFIGURATION D'EXPRESS
// =================================================================
const app = express();
const port = process.env.PORT || 3000;

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

// --- CONFIGURATION i18n (TRADUCTION) ---
i18next
  .use(FsBackend) // Charge les traductions depuis les fichiers (locales/...)
  .use(i18nextMiddleware.LanguageDetector) // Détecte la langue
  .init({
    backend: {
      loadPath: __dirname + '/locales/{{lng}}/translation.json',
    },
    fallbackLng: 'fr', // Langue par défaut si la détection échoue
    preload: ['fr', 'en'], // Langues supportées

    detection: {
        order: ['querystring', 'cookie', 'header'],

        caches: ['cookie'],
        cookieOptions: {
            path: '/',
            maxAge: 30 * 24 * 60 * 60 * 1000
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

// Configuration du middleware de session
app.use(session({
  secret: 'votre-secret-personnel-tres-difficile-a-deviner', // Change this!
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set true in production with HTTPS
}));

// Middleware pour i18next (doit être après 'session')
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
    res.status(401).json({ error: 'Accès non autorisé. Veuillez vous reconnecter.' });
}

// Middleware pour vérifier si un compte admin existe déjà
function checkAdminExists(req, res, next) {
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) {
            return res.status(500).send("Erreur serveur");
        }
        if (row.count === 0) {
            next(); // Allow access to registration if no user exists
        } else {
            res.redirect('/connexion'); // Redirect if an admin already exists
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

// Création de la table 'articles' (version bilingue)
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

// =================================================================
// 5. ROUTES
// =================================================================

// --- PAGES PUBLIQUES (LECTURE) ---

// Page d'accueil
app.get('/', (req, res) => {
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sql = `
        SELECT id, title_${lang} as title, content_${lang} as content, cover_image_url, publication_date 
        FROM articles ORDER BY publication_date DESC LIMIT 3
    `;
    db.all(sql, [], (err, rows) => {
        if (err) { return res.status(500).send("Erreur BDD"); }
        
        const articlesWithCovers = rows.map(article => {
            let finalCoverImage = null;
            if (article.cover_image_url) {
                finalCoverImage = article.cover_image_url;
            } else {
                const match = article.content.match(/!\[.*?\]\((.*?)\)/);
                finalCoverImage = match ? match[1] : null;
            }
            // Strip markdown for excerpt
            const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
            return { ...article, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
        });

        res.render('index', { articles: articlesWithCovers, pageTitle: 'Accueil', activePage: 'accueil' });
    });
});

// Pages statiques (These are not translated by i18next unless you add keys)
app.get('/profil', (req, res) => {
    res.render('profil', { pageTitle: 'Mon Profil', activePage: 'profil' });
});

app.get('/stage', (req, res) => {
    res.render('stage', { pageTitle: 'Mon Stage', activePage: 'stage' });
});

// Page de tout le journal
// Page de tout le journal (avec pagination)
app.get('/journal', (req, res) => {
    // Récupère le numéro de page (par défaut 1)
    const currentPage = parseInt(req.query.page) || 1;
    // Calcule l'offset pour SQL
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;

    const lang = req.language === 'en' ? 'en' : 'fr';

    // 1. Récupérer les entrées pour la page actuelle
    const sqlEntries = `
        SELECT id, title_${lang} as title, content_${lang} as content, cover_image_url, publication_date 
        FROM articles 
        ORDER BY publication_date DESC
        LIMIT ? OFFSET ?
    `;

    // 2. Compter le nombre total d'entrées
    const sqlCount = `SELECT COUNT(*) as totalCount FROM articles`;

    // Exécute les deux requêtes
    db.all(sqlEntries, [ITEMS_PER_PAGE, offset], (err, rows) => {
        if (err) { return res.status(500).send("Erreur BDD (entrées)"); }

        db.get(sqlCount, [], (errCount, countResult) => {
            if (errCount) { return res.status(500).send("Erreur BDD (compte)"); }

            const totalEntries = countResult.totalCount;
            const totalPages = Math.ceil(totalEntries / ITEMS_PER_PAGE);

            // Logique pour l'image de couverture (inchangée)
            const articlesWithCovers = rows.map(article => {
                let finalCoverImage = null;
                if (article.cover_image_url) { /* ... */ } else { /* ... */ }
                const plainContent = article.content.replace(/!\[.*?\]\(.*?\)|[#*`~]|(\[.*?\]\(.*?\))/g, '');
                return { ...article, coverImage: finalCoverImage, excerpt: plainContent.substring(0, 350) };
            });

            // On passe les données à la vue
            res.render('journal', {
                articles: articlesWithCovers,
                pageTitle: 'Journal de Bord',
                activePage: 'journal',
                currentPage: currentPage, // Page actuelle
                totalPages: totalPages    // Nombre total de pages
            });
        });
    });
});

// Page de détail d'une entrée
app.get('/entree/:id', (req, res) => {
    const id = req.params.id;
    const lang = req.language === 'en' ? 'en' : 'fr';
    const sql = `
        SELECT id, title_${lang} as title, content_${lang} as content, cover_image_url, publication_date 
        FROM articles WHERE id = ?
    `;
    db.get(sql, id, (err, article) => {
        if (err) { return res.status(500).send("Erreur BDD"); }
        if (!article) { return res.status(404).send("Entrée non trouvée !"); }
        
        let finalContent = article.content;
        const markdownTitle = '# ' + article.title;
        if (finalContent.trim().startsWith(markdownTitle)) {
            finalContent = finalContent.substring(markdownTitle.length).trim();
        }

        article.content = marked.parse(finalContent); 
        res.render('entry_detail', { article: article, pageTitle: article.title, activePage: 'journal' });
    });
});


// --- AUTHENTIFICATION ET API ---

// Affiche le formulaire de connexion
app.get('/connexion', (req, res) => {
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) { return res.status(500).send("Erreur serveur"); }
        res.render('login', { pageTitle: 'Administration', error: null, adminExists: row.count > 0, activePage: 'admin' });
    });
});

// Traite la tentative de connexion
app.post('/connexion', (req, res) => {
    const { username, password } = req.body;
    const sql = 'SELECT * FROM users WHERE username = ?';
    db.get(sql, [username], (err, user) => {
        if (err) { return res.status(500).send("Erreur du serveur."); }
        if (!user) {
            return res.render('login', { pageTitle: 'Administration', error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin' });
        }
        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.userId = user.id;
                req.session.username = user.username;
                res.redirect('/');
            } else {
                res.render('login', { pageTitle: 'Administration', error: "Nom d'utilisateur ou mot de passe incorrect.", adminExists: true, activePage: 'admin' });
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
    res.render('register', { pageTitle: 'Créer le compte Administrateur', activePage: 'admin' });
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
    res.render('new_entry', { pageTitle: 'Nouvelle entrée', activePage: 'journal' });
});

// Traite la création d'une entrée (bilingual)
app.post('/journal', isAuthenticated, (req, res) => {
    const { title_fr, title_en, content_fr, content_en, cover_image_url } = req.body;
    const userId = req.session.userId;
    const sql = 'INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id, cover_image_url) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sql, [title_fr, title_en, content_fr, content_en, userId, cover_image_url], function(err) {
        if (err) { return res.status(500).send("Erreur création entrée."); }
        res.redirect('/journal');
    });
});

// Affiche le formulaire de modification (bilingual)
app.get('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    // Fetch all fields for editing
    const sql = "SELECT * FROM articles WHERE id = ?"; 
    db.get(sql, id, (err, article) => {
        if (err) { return res.status(500).send("Erreur BDD"); }
        if (!article) { return res.status(404).send("Entrée non trouvée !");}
        // Send the complete article object with _fr and _en fields
        res.render('edit_entry', { article: article, pageTitle: 'Modifier : ' + article.title_fr, activePage: 'journal' });
    });
});

// Traite la modification d'une entrée (bilingual)
app.post('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const { title_fr, title_en, content_fr, content_en, cover_image_url } = req.body;
    const sql = 'UPDATE articles SET title_fr = ?, title_en = ?, content_fr = ?, content_en = ?, cover_image_url = ? WHERE id = ?';
    db.run(sql, [title_fr, title_en, content_fr, content_en, cover_image_url, id], function(err) {
        if (err) { return res.status(500).send("Erreur mise à jour entrée."); }
        res.redirect('/journal');
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