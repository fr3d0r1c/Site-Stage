// =================================================================
// 1. IMPORTS (DÉPENDANCES)
// =================================================================
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');

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

// =================================================================
// 3. MIDDLEWARES
// =================================================================
// Servir les fichiers statiques (CSS, JS, images uploadées)
app.use(express.static('public'));

// Middleware pour lire les données de formulaire
app.use(express.urlencoded({ extended: true }));

// Configuration du middleware de session
app.use(session({
  secret: 'votre-secret-personnel-tres-difficile-a-deviner',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Mettre à true en production avec HTTPS
}));

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
            next(); // Aucun utilisateur, on peut s'inscrire
        } else {
            res.redirect('/connexion'); // Un admin existe déjà, on redirige
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

// Création de la table 'articles'
const createArticleTable = `
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  publication_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  image_filename TEXT,
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
    const sql = 'SELECT * FROM articles ORDER BY publication_date DESC LIMIT 3';
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).send("Erreur dans la base de données");
        }
        res.render('index', { articles: rows, pageTitle: 'Accueil', activePage: 'accueil' });
    });
});

// Pages statiques
app.get('/profil', (req, res) => {
    res.render('profil', { pageTitle: 'Mon Profil', activePage: 'profil' });
});

app.get('/stage', (req, res) => {
    res.render('stage', { pageTitle: 'Mon Stage', activePage: 'stage' });
});

// Page de tout le journal
app.get('/journal', (req, res) => {
    const sql = 'SELECT * FROM articles ORDER BY publication_date DESC';
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).send("Erreur dans la base de données");
        }
        res.render('journal', { articles: rows, pageTitle: 'Journal de Bord', activePage: 'journal' });
    });
});

// Page de détail d'une entrée
app.get('/entree/:id', (req, res) => {
    const id = req.params.id;
    const sql = "SELECT * FROM articles WHERE id = ?";
    db.get(sql, id, (err, article) => {
        if (err) {
            return res.status(500).send("Erreur dans la base de données");
        }
        if (!article) {
            return res.status(404).send("Entrée non trouvée !");
        }
        res.render('entry_detail', { article: article, pageTitle: article.title, activePage: 'journal' });
    });
});


// --- AUTHENTIFICATION (ADMIN) ---

// Affiche le formulaire de connexion
app.get('/connexion', (req, res) => {
    const sql = "SELECT COUNT(*) as count FROM users";
    db.get(sql, [], (err, row) => {
        if (err) {
            return res.status(500).send("Erreur serveur");
        }
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

// Affiche le formulaire d'inscription (seulement si aucun admin n'existe)
app.get('/inscription', checkAdminExists, (req, res) => {
    res.render('register', { pageTitle: 'Créer le compte Administrateur', activePage: 'admin' });
});

// Traite la création du premier et unique utilisateur
app.post('/inscription', checkAdminExists, (req, res) => {
    const { username, password } = req.body;
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) { return res.status(500).send("Erreur lors du hachage."); }
        const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
        db.run(sql, [username, hash], function(err) {
            if (err) { return res.status(400).send("Erreur lors de la création du compte."); }
            res.redirect('/connexion');
        });
    });
});


// --- GESTION DU CONTENU (ROUTES PROTÉGÉES) ---

// Affiche le formulaire de création
app.get('/journal/nouvelle', isAuthenticated, (req, res) => {
    res.render('new_entry', { pageTitle: 'Nouvelle entrée', activePage: 'journal' });
});

// Traite la création d'une entrée
app.post('/journal', isAuthenticated, upload.single('image'), (req, res) => {
    const { title, content } = req.body;
    const userId = req.session.userId;
    const imageFilename = req.file ? req.file.filename : null;
    const sql = 'INSERT INTO articles (title, content, user_id, image_filename) VALUES (?, ?, ?, ?)';
    db.run(sql, [title, content, userId, imageFilename], function(err) {
        if (err) { return res.status(500).send("Erreur lors de la création de l'entrée."); }
        res.redirect('/journal');
    });
});

// Affiche le formulaire de modification
app.get('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = "SELECT * FROM articles WHERE id = ?";
    db.get(sql, id, (err, article) => {
        if (err) { return res.status(500).send("Erreur dans la base de données"); }
        res.render('edit_entry', { article: article, pageTitle: 'Modifier : ' + article.title, activePage: 'journal' });
    });
});

// Traite la modification d'une entrée
app.post('/entree/:id/edit', isAuthenticated, upload.single('image'), (req, res) => {
    const id = req.params.id;
    const { title, content } = req.body;
    if (req.file) {
        const imageFilename = req.file.filename;
        const sql = 'UPDATE articles SET title = ?, content = ?, image_filename = ? WHERE id = ?';
        db.run(sql, [title, content, imageFilename, id], function(err) {
            if (err) { return res.status(500).send("Erreur lors de la mise à jour de l'entrée."); }
            res.redirect('/journal');
        });
    } else {
        const sql = 'UPDATE articles SET title = ?, content = ? WHERE id = ?';
        db.run(sql, [title, content, id], function(err) {
            if (err) { return res.status(500).send("Erreur lors de la mise à jour de l'entrée."); }
            res.redirect('/journal');
        });
    }
});

// Traite la suppression d'une entrée
app.post('/entree/:id/delete', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM articles WHERE id = ?';
    db.run(sql, id, function(err) {
        if (err) { return res.status(500).send("Erreur lors de la suppression de l'entrée."); }
        res.redirect('/journal');
    });
});


// =================================================================
// 6. DÉMARRAGE DU SERVEUR
// =================================================================
app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});