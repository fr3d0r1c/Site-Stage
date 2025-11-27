const request = require('supertest');

const nodemailer = require('nodemailer');
jest.mock('nodemailer');

const sendMailMock = jest.fn().mockResolvedValue({ response: 'Email simulé envoyé' });
nodemailer.createTransport.mockReturnValue({ 
    sendMail: sendMailMock 
});

const { app, db } = require('./app');

let agent;

// On dit à Jest d'attendre la fin de la fermeture de la BDD avant de quitter
afterAll((done) => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
      done(err); // Signale à Jest une erreur
    } else {
      console.log('Connexion BDD de test fermée.');
      done(); // Signale à Jest que c'est terminé
    }
  });
});

// --- Groupe de tests pour les routes publiques ---
describe('Tests des routes publiques (GET)', () => {

  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1 seconde
  });
  
  test('GET / - Doit répondre avec un statut 200 (OK)', async () => {
    const response = await request(app).get('/');
    expect(response.statusCode).toBe(200);
  });

  test('GET /profil/qui-suis-je - Doit répondre avec un statut 200 (OK)', async () => {
    const response = await request(app).get('/profil/qui-suis-je'); // <-- ON TESTE LA NOUVELLE ROUTE
    expect(response.statusCode).toBe(200);
  });

  test('GET /page-inexistante - Doit répondre avec un statut 404 (Not Found)', async () => {
    const response = await request(app).get('/page-qui-n-existe-pas');
    expect(response.statusCode).toBe(404);
  });

  test('GET /profil/qui-suis-je - Doit répondre 200 OK', async () => {
    const response = await request(app).get('/profil/qui-suis-je');
    expect(response.statusCode).toBe(200);
  });

  test('GET /stage/l-entreprise - Doit répondre 200 OK', async () => {
    const response = await request(app).get('/stage/l-entreprise');
    expect(response.statusCode).toBe(200);
  });

  test('GET /?lng=en - Doit afficher le site en anglais', async () => {
    const response = await request(app).get('/?lng=en');
    expect(response.statusCode).toBe(200);
  });
});

// --- Groupe de tests pour les routes protégées (quand on n'est PAS connecté) ---
describe('Tests des routes protégées (non authentifié)', () => {

  test('GET /journal/nouvelle - Doit rediriger (302) vers /connexion', async () => {
    const response = await request(app).get('/journal/nouvelle');
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/connexion');
  });

  test('POST /entree/:id/delete - Doit rediriger (302) vers /connexion', async () => {
    const response = await request(app).post('/entree/1/delete');
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/connexion');
  });

  test('POST /upload-image - Doit renvoyer une erreur 401 (Non Autorisé)', async () => {
    const response = await request(app).post('/upload-image');
    expect(response.statusCode).toBe(401);
    expect(response.body.error).toBeDefined();
  });
  
  // Note : Ce test dépend du fait que le bloc 'authentifié' (ci-dessous) s'exécute
  // et crée l'utilisateur 'testadmin' dans son 'beforeAll'
  test('POST /connexion - Échoue avec un mauvais mot de passe', async () => {
    const response = await request(app)
      .post('/connexion')
      .send({
        username: 'testadmin',
        password: 'mauvaismotdepasse'
      });

    expect(response.statusCode).toBe(200); // Recharge la page de login
    expect(response.text).toContain("Nom d&#39;utilisateur ou mot de passe incorrect.");
  });

});

// --- Groupe de tests pour un admin authentifié ---
describe('Tests des routes admin (authentifié)', () => {

  let agent; // L'agent qui sera "connecté"
  const adminUser = {
    username: 'testadmin',
    password: 'password123!',
    email: 'admin@test.com'
  };
  let tagIds = []; // Pour stocker les IDs des tags de test

  // 'beforeAll' s'exécute UNE SEULE FOIS avant tous les tests de ce bloc
  beforeAll(async () => {
    // 1. Crée un agent qui va garder les cookies de session
    agent = request.agent(app);

    // 2. Crée le compte admin
    await agent
      .post('/inscription')
      .send(adminUser);

    // 3. Connecte l'agent
    await agent
      .post('/connexion')
      .send(adminUser);
      
    // 4. Créer les tags de test dans la BDD en mémoire
    const tagNames = ['Test', 'Jest', 'JavaScript'];
    const tagPromises = tagNames.map(name => {
      return new Promise((resolve, reject) => {
        db.run('INSERT INTO tags (name_fr, name_en) VALUES (?, ?)', [name, name], function(err) {
          if (err) return reject(err);
          resolve(this.lastID); // Renvoie le nouvel ID
        });
      });
    });
    tagIds = await Promise.all(tagPromises); // Sera [1, 2, 3]
  });

  // Test 7 (corrigé): L'agent connecté peut accéder à la page admin
  test('GET /admin - Doit rediriger vers /admin/dashboard', async () => {
    const response = await agent.get('/admin');
    expect(response.statusCode).toBe(302); // Redirection
    expect(response.headers.location).toBe('/admin/dashboard');
  });

  // Test 8: L'agent connecté peut accéder à la page de création d'article
  test('GET /journal/nouvelle - Doit répondre avec un statut 200 (OK)', async () => {
    const response = await agent.get('/journal/nouvelle');
    expect(response.statusCode).toBe(200);
    expect(response.text).toContain("Ajouter une entrée"); // Ou une clé de traduction
  });

  // Test 9 (corrigé): L'agent connecté peut accéder à la page de gestion des tags
  test('GET /admin/tags - Doit répondre avec un statut 200 (OK)', async () => {
    const response = await agent.get('/admin/tags');
    expect(response.statusCode).toBe(200);
    // On vérifie le titre h1
    expect(response.text).toContain("Gérer les Tags");
  });

  // Test 10 (corrigé): L'agent connecté peut créer une nouvelle entrée
  test('POST /journal - Peut créer une nouvelle entrée et la vérifie en BDD', async () => {
    const newEntry = {
      title_fr: 'Titre de Test (Jest)',
      title_en: 'Test Title (Jest)',
      content_fr: '# Un test\nContenu français.',
      content_en: '# A test\nEnglish content.',
      cover_image_url: 'http://example.com/image.jpg',
      tags: tagIds // On envoie le tableau d'IDs [1, 2, 3]
    };
    const response = await agent.post('/journal').send(newEntry);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/journal');
    // Vérifie la BDD
    const savedEntry = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM articles WHERE title_fr = ?', [newEntry.title_fr], (err, row) => err ? reject(err) : resolve(row));
    });
    expect(savedEntry).toBeDefined();
    expect(savedEntry.title_en).toBe(newEntry.title_en);
    // Vérifie les tags
    const savedTags = await new Promise((resolve, reject) => {
      db.all('SELECT t.name_fr FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?', [savedEntry.id], (err, rows) => err ? reject(err) : resolve(rows.map(r => r.name_fr)));
    });
    expect(savedTags).toHaveLength(3);
    expect(savedTags).toContain('Test');
  });

  // Test 11: La création échoue si des champs requis sont manquants
  test('POST /journal - Redirige (Statut 302) avec un message d\'erreur si le titre est manquant', async () => {
    const badEntry = {
      title_en: 'Bad Test Title',
      content_fr: 'Contenu...',
      content_en: 'Content...',
      tags: []
    };
    const response = await agent.post('/journal').send(badEntry);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/journal/nouvelle');
  });

  // Test 12: L'agent connecté peut supprimer une entrée
  test('POST /entree/:id/delete - Peut supprimer une entrée et ses liaisons de tags', async () => {
    // 1. Crée une entrée à supprimer
    const entryData = { title_fr: 'Article à Supprimer', title_en: 'Delete Me', content_fr: '...', content_en: '...', user_id: 1 };
    const creationResult = await new Promise((resolve, reject) => {
      db.run('INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id) VALUES (?, ?, ?, ?, ?)', [entryData.title_fr, entryData.title_en, entryData.content_fr, entryData.content_en, entryData.user_id], function(err) { if (err) reject(err); resolve({ id: this.lastID }); });
    });
    const entryIdToDelete = creationResult.id;
    // Lie un tag
    const tagId = tagIds[0];
    await new Promise((resolve, reject) => { db.run('INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)', [entryIdToDelete, tagId], (err) => err ? reject(err) : resolve()); });
    
    // 2. Envoie la requête de suppression
    const response = await agent.post(`/entree/${entryIdToDelete}/delete`);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/journal');
    
    // 3. Vérifie la BDD
    const deletedEntry = await new Promise((resolve, reject) => { db.get('SELECT * FROM articles WHERE id = ?', [entryIdToDelete], (err, row) => err ? reject(err) : resolve(row)); });
    expect(deletedEntry).toBeUndefined(); // L'article a disparu
    const deletedLinks = await new Promise((resolve, reject) => { db.all('SELECT * FROM article_tags WHERE article_id = ?', [entryIdToDelete], (err, rows) => err ? reject(err) : resolve(rows)); });
    expect(deletedLinks).toHaveLength(0); // Les liens ont disparu (ON DELETE CASCADE)
  });

  // Test 13 (corrigé): L'agent connecté peut modifier une entrée
  test('POST /entree/:id/edit - Peut modifier une entrée et mettre à jour les tags', async () => {
    // 1. Crée une entrée à modifier
    const entryData = { title_fr: 'Article à Modifier', title_en: 'Edit Me', content_fr: 'Original', content_en: 'Original', user_id: 1 };
    const creationResult = await new Promise((resolve, reject) => { db.run('INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id) VALUES (?, ?, ?, ?, ?)', [entryData.title_fr, entryData.title_en, entryData.content_fr, entryData.content_en, entryData.user_id], function(err) { if (err) reject(err); resolve({ id: this.lastID }); }); });
    const entryIdToEdit = creationResult.id;
    // Lie le tag 'Test' (ID 1)
    await new Promise((resolve, reject) => { db.run('INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)', [entryIdToEdit, tagIds[0]], (err) => err ? reject(err) : resolve()); });

    // 2. Prépare les données de mise à jour
    const updatedData = {
      title_fr: 'Article à Modifier', title_en: 'EDITED TITLE',
      content_fr: 'Original', content_en: 'Original',
      cover_image_url: 'http://example.com/new-image.jpg',
      tags: [tagIds[1], tagIds[2]] // Nouveaux tags (IDs 2 et 3)
    };

    // 3. Envoie la requête de mise à jour
    const response = await agent.post(`/entree/${entryIdToEdit}/edit`).send(updatedData);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/journal');

    // 4. Vérifie la BDD
    const updatedEntry = await new Promise((resolve, reject) => { db.get('SELECT * FROM articles WHERE id = ?', [entryIdToEdit], (err, row) => err ? reject(err) : resolve(row)); });
    expect(updatedEntry.title_en).toBe('EDITED TITLE');
    expect(updatedEntry.cover_image_url).toBe('http://example.com/new-image.jpg');
    // Vérifie les tags
    const updatedTags = await new Promise((resolve, reject) => { db.all('SELECT t.name_fr FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?', [entryIdToEdit], (err, rows) => err ? reject(err) : resolve(rows.map(r => r.name_fr))); });
    expect(updatedTags).toHaveLength(2);
    expect(updatedTags).toContain('Jest');
    expect(updatedTags).not.toContain('Test'); // L'ancien tag a disparu
  });

  // Test 15 (corrigé): La modification du mot de passe échoue si les mots de passe ne correspondent pas
  test('POST /change-password - Échoue si les nouveaux mots de passe ne correspondent pas', async () => {
    const response = await agent
      .post('/change-password')
      .send({
        currentPassword: 'password123!', // Bon mot de passe
        newPassword: 'nouveauMotDePasseFacile',
        confirmPassword: 'nouveauMotDePasseDIFFERENT'
      });
    expect(response.statusCode).toBe(200); // Recharge la page
    expect(response.text).toContain("Les nouveaux mots de passe ne correspondent pas.");
  });

  // Test 16: Le tri de la page /journal fonctionne
  test('GET /journal?sort=alpha_asc - Doit trier les entrées par ordre alphabétique', async () => {
    const entryZ = {
      title_fr: 'Titre Z (Tri)', title_en: 'Title Z',
      content_fr: 'Contenu', content_en: 'Content', user_id: 1
    };
    const entryA = {
      title_fr: 'Titre A (Tri)', title_en: 'Title A',
      content_fr: 'Contenu', content_en: 'Content', user_id: 1
    };

    await new Promise((resolve, reject) => {
      db.run('INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id) VALUES (?, ?, ?, ?, ?)',
        [entryZ.title_fr, entryZ.title_en, entryZ.content_fr, entryZ.content_en, entryZ.user_id], 
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id) VALUES (?, ?, ?, ?, ?)',
        [entryA.title_fr, entryA.title_en, entryA.content_fr, entryA.content_en, entryA.user_id],
        (err) => err ? reject(err) : resolve()
      );
    });

    const response = await agent.get('/journal?sort=alpha_asc');

    expect(response.statusCode).toBe(200);

    const indexA = response.text.indexOf('Titre A (Tri)');
    const indexZ = response.text.indexOf('Titre Z (Tri)');

    expect(indexA).toBeGreaterThan(-1); // S'assure que "Titre A" est bien là
    expect(indexZ).toBeGreaterThan(-1); // S'assure que "Titre Z" est bien là
    expect(indexA).toBeLessThan(indexZ); // Vérifie que A vient avant Z
  });

  // Test 17: La page /search filtre par texte ET par tag
  test('GET /search - Doit filtrer par tag et par texte', async () => {
    const entryDataA = {
      title_fr: 'Article de Recherche A', title_en: 'Search A',
      content_fr: 'Contenu A', content_en: 'Content A', user_id: 1
    };
    const entryDataB = {
      title_fr: 'Article de Recherche B', title_en: 'Search B',
      content_fr: 'Contenu B', content_en: 'Content B', user_id: 1
    };

    const articleA = await new Promise((resolve, reject) => {
      db.run('INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id) VALUES (?, ?, ?, ?, ?)',
        [entryDataA.title_fr, entryDataA.title_en, entryDataA.content_fr, entryDataA.content_en, entryDataA.user_id],
        function(err) { if (err) reject(err); resolve({ id: this.lastID }); }
      );
    });
    const articleB = await new Promise((resolve, reject) => {
      db.run('INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id) VALUES (?, ?, ?, ?, ?)',
        [entryDataB.title_fr, entryDataB.title_en, entryDataB.content_fr, entryDataB.content_en, entryDataB.user_id],
        function(err) { if (err) reject(err); resolve({ id: this.lastID }); }
      );
    });

    await new Promise((resolve, reject) => { db.run('INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)', [articleA.id, tagIds[0]], (err) => err ? reject(err) : resolve()); });
    await new Promise((resolve, reject) => { db.run('INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)', [articleB.id, tagIds[1]], (err) => err ? reject(err) : resolve()); });

    const response = await agent.get(`/search?query=Recherche&tag=${tagIds[0]}`);

    expect(response.statusCode).toBe(200);

    expect(response.text).toContain('Article de Recherche A');
    expect(response.text).not.toContain('Article de Recherche B');
  });
});

describe('Tests fonctionnels des Commentaires', () => {
  let articleId;

  beforeAll(async () => {
    const creation = await new Promise((resolve, reject) => {
      db.run("INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id) VALUES ('Art Com', 'Art Com', 'Contenu', 'Content', 1)", function(err) {
        if (err) reject(err); else resolve(this.lastID);
      });
    });
    articleId = creation;
  });

  test('POST /article/:id/comment - Accepte un commentaire valide', async () => {
    const validComment = {
      author_name: 'Testeur',
      author_email: 'test@example.com', // <-- AJOUTE CETTE LIGNE (Obligatoire maintenant)
      content: 'Ceci est un message très constructif et poli.'
    };

    const response = await request(app)
      .post(`/article/${articleId}/comment`)
      .send(validComment);

    expect(response.statusCode).toBe(302);

    await new Promise(resolve => setTimeout(resolve, 500));

    const savedComment = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM comments WHERE content = ?', [validComment.content], (err, row) => err ? reject(err) : resolve(row));
    });
    expect(savedComment).toBeDefined();
    expect(savedComment.is_approved).toBe(1);
  });

  test('POST /article/:id/comment - Rejette un commentaire vulgaire', async () => {
    const badComment = {
      author_name: 'Troll',
      content: 'Ceci est un message de merde avec des insultes.' // Contient "merde"
    };

    const response = await request(app)
      .post(`/article/${articleId}/comment`)
      .send(badComment);

    expect(response.statusCode).toBe(302);

    const rejectedComment = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM comments WHERE content = ?', [badComment.content], (err, row) => err ? reject(err) : resolve(row));
    });
    expect(rejectedComment).toBeUndefined();
  });
});

describe('Système de Likes', () => {
  let articleId;
  const guestAgent = request.agent(app); 
  
  beforeAll(async () => {
    await new Promise(resolve => {
      db.run("INSERT INTO articles (title_fr, title_en, content_fr, content_en, status) VALUES ('Test Like', 'Test Like', 'C', 'C', 'published')", function() {
        articleId = this.lastID;
        resolve();
      });
    });
    
    await guestAgent.post('/guest/login').send({
      name: 'LikeurFou',
      email: 'like@test.com',
      avatar_style: 'bottts'
    });
  });
  
  test('POST /api/entree/:id/like - Ajoute un like', async () => {
    const response = await guestAgent.post(`/api/entree/${articleId}/like`);
    
    expect(response.statusCode).toBe(200);
    expect(response.body.likes).toBe(1);
    expect(response.body.liked).toBe(true);
  });
  
  test('POST /api/entree/:id/like - Retire le like (Toggle)', async () => {
    const response = await guestAgent.post(`/api/entree/${articleId}/like`);
    
    expect(response.statusCode).toBe(200);
    expect(response.body.likes).toBe(0);
    expect(response.body.liked).toBe(false);
  });
});