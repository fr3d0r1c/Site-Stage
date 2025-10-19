const express = require('express');
const app = express();
const port = 3000;
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./blog.db', (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log('Connecté à la base de données SQLite.');
});

const createArticleTable = `
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  publication_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users (id)
);
`;
const createUserTable = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);
`;
const session = require('express-session');
const bcrypt = require('bcrypt');

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'votre-secret-personnel-tres-difficile-a-deviner', // Changez ceci pour une chaîne aléatoire
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Mettre à true si vous utilisez HTTPS
}));

// Rendre les données de session disponibles dans toutes les vues
app.use((req, res, next) => {
    res.locals.username = req.session.username;
    next();
});

// Middleware pour vérifier si l'utilisateur est authentifié
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next(); // Si l'utilisateur est connecté, on continue
    }
    res.redirect('/connexion'); // Sinon, on le redirige vers la page de connexion
}

db.run(createArticleTable, (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log("Table 'articles' prête.");
});

db.run(createUserTable, (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log("Table 'users' prête.");
});

// Middleware to serve static files (CSS, images, etc.) from the 'public' directory
app.use(express.static('public'));

app.get('/', (req, res) => {
    const sql = 'SELECT * FROM articles ORDER BY publication_date DESC LIMIT 3';

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).send("Erreur dans la base de données");
        }
        res.render('index', { articles: rows, pageTitle: 'Accueil' });
    });
});

app.get('/journal', (req, res) => {
    const sql = 'SELECT * FROM articles ORDER BY publication_date DESC';

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).send("Erreur dans la base de données");
        }
        res.render('journal', { articles: rows, pageTitle: 'Tous les articles' });
    });
});

// Route pour afficher UN SEUL article en détail
app.get('/entree/:id', (req, res) => {
    const id = req.params.id;
    const sql = "SELECT * FROM articles WHERE id = ?";

    db.get(sql, id, (err, article) => {
        if (err) {
            res.status(500).send("Erreur dans la base de données");
            throw err;
        }

        if (!article) {
            res.status(404).send("Article non trouvé !");
            return;
        }

        res.render('entry_detail', { article: article, pagetitle: article.title });
    });
});

app.get('/journal/nouvelle', isAuthenticated, (req, res) => {
    res.render('new_entry', { pageTitle: 'Nouvel article' });
});

// Route pour AFFICHER le formulaire de modification d'un article
app.get('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = "SELECT * FROM articles WHERE id = ?";

    db.get(sql, id, (err, article) => {
        if (err) {
            res.status(500).send("Erreur dans la base de données");
            throw err;
        }

        // On envoie le HTML du formulaire pré-rempli
        res.render('edit_entry', { article: article, pageTitle: 'Modifier : ' + article.title });
    });
});

app.get('/connexion', (req, res) => {
    res.render('login', { pageTitle: 'Connexion' });
});

// Route de déconnexion
app.get('/deconnexion', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            // Gérer l'erreur, par exemple rediriger quand même
            return res.redirect('/');
        }
        res.clearCookie('connect.sid'); // 'connect.sid' est le nom par défaut du cookie de session
        res.redirect('/');
    });
});

// Affiche la page de profil
app.get('/profil', (req, res) => {
    res.render('profil', { pageTitle: 'Mon Profil' });
});

app.get('/stage', (req, res) => {
    res.render('stage', { pageTitle: 'Mon Stage' });
});

app.post('/journal', isAuthenticated, (req, res) => {
    const { title, content } = req.body;
    const userId = req.session.userId;

    const sql = 'INSERT INTO articles (title, content, user_id) VALUES (?, ?, ?)';
    
    db.run(sql, [title, content, userId], function(err) {
        if (err) {
            return res.status(500).send("Erreur lors de la création de l'article");
        }
        res.redirect('/');
    });
});

// Route pour gérer la suppression d'un article
app.post('/entree/:id/delete', isAuthenticated, (req, res) => {
    // On récupère l'ID depuis les paramètres de l'URL
    const id = req.params.id;
    const sql = 'DELETE FROM articles WHERE id = ?';

    db.run(sql, id, function(err) {
        if (err) {
            res.status(500).send("Erreur lors de la suppression de l'article");
            return console.error(err.message);
        }
        console.log(`L'article avec l'ID ${id} a été supprimé, ${this.changes} ligne(s) affectée(s).`);
        
        // On redirige l'utilisateur vers la liste de tous les articles
        res.redirect('/articles');
    });
});

// Route pour TRAITER la modification d'un article
app.post('/entree/:id/edit', isAuthenticated, (req, res) => {
    const id = req.params.id;
    const { title, content } = req.body; // Raccourci pour req.body.title et req.body.content

    const sql = 'UPDATE articles SET title = ?, content = ? WHERE id = ?';

    db.run(sql, [title, content, id], function(err) {
        if (err) {
            res.status(500).send("Erreur lors de la mise à jour de l'article");
            return console.error(err.message);
        }
        console.log(`L'article avec l'ID ${id} a été mis à jour.`);
        res.redirect('/articles');
    });
});

app.post('/connexion', (req, res) => {
    const { username, password } = req.body;
    const sql = 'SELECT * FROM users WHERE username = ?';

    db.get(sql, [username], (err, user) => {
        if (err) {
            return res.status(500).send("Erreur du serveur.");
        }
        // Si aucun utilisateur n'est trouvé avec ce nom d'utilisateur
        if (!user) {
            return res.status(400).send("Nom d'utilisateur ou mot de passe incorrect.");
        }

        // On compare le mot de passe fourni avec le hash stocké
        bcrypt.compare(password, user.password, (err, result) => {
            if (err) {
                return res.status(500).send("Erreur lors de la vérification.");
            }
            if (result) {
                // Les mots de passe correspondent ! On ouvre une session.
                req.session.userId = user.id;
                req.session.username = user.username;
                console.log(`Utilisateur ${user.username} connecté.`);
                res.redirect('/');
            } else {
                // Les mots de passe ne correspondent pas
                res.status(400).send("Nom d'utilisateur ou mot de passe incorrect.");
            }
        });
    });
});

// On demande à l'application d'écouter sur le port défini
app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});