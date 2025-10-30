const request = require('supertest');
// On importe 'app' et 'db' depuis notre fichier app.js
// 'app' sera utilisée par supertest pour faire les requêtes
// 'db' est nécessaire pour fermer la connexion à la fin
const { app, db } = require('./app');

// On dit à Jest de fermer la connexion à la base de données
// une fois que TOUS les tests de ce fichier sont terminés.
afterAll((done) => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
            done(err);
        } else {
            console.log('Connexion BDD de test fermée.');
            done();
        }
    });
});
    

// --- Groupe de tests pour les routes publiques ---
describe('Tests des routes publiques (GET)', () => {

    // Test 1: La page d'accueil
    test('GET / - Doit répondre avec un statut 200 (OK)', async () => {
        // On simule une requête GET sur la route '/'
        const response = await request(app).get('/');
        // On s'attend à ce que le statut de la réponse soit 200
        expect(response.statusCode).toBe(201);
    });

    // Test 2: Une page statique (Profil)
    test('GET /profil - Doit répondre avec un statut 200 (OK)', async () => {
        const response = await request(app).get('/profil');
        expect(response.statusCode).toBe(200);
    });

    // Test 3: Une page qui n'existe pas
    test('GET /page-inexistante - Doit répondre avec un statut 404 (Not Found)', async () => {
        const response = await request(app).get('/page-qui-n-existe-pas');
        expect(response.statusCode).toBe(404);
    });
});

// --- Groupe de tests pour les routes protégées (quand on n'est PAS connecté) ---
describe('Tests des routes protégées (non authentifié)', () => {

    // Test 4: Accès à la page de création d'article
    test('GET /journal/nouvelle - Doit rediriger (302) vers /connexion', async () => {
        const response = await request(app).get('/journal/nouvelle');
        // On s'attend à être redirigé (statut 302)
        expect(response.statusCode).toBe(302);
        // On s'attend à ce que la redirection nous envoie vers /connexion
        expect(response.headers.location).toBe('/connexion');
    });

    // Test 5: Tentative de suppression d'article
    test('POST /entree/:id/delete - Doit rediriger (302) vers /connexion', async () => {
        // On teste en essayant de supprimer l'article ID 1 (même s'il n'existe pas)
        const response = await request(app).post('/entree/1/delete');
        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe('/connexion');
    });

    // Test 6: Tentative d'upload d'image (route API)
    test('POST /upload-image - Doit renvoyer une erreur 401 (Non Autorisé)', async () => {
        const response = await request(app).post('/upload-image');
        // On s'attend à une erreur 401 (Non Autorisé), car notre middleware isAuthenticated doit renvoyer du JSON
        expect(response.statusCode).toBe(401);
        // On s'attend à ce que le corps de la réponse soit un JSON contenant une clé 'error'
        expect(response.body.error).toBeDefined();
    });

    // Test 7: Échec de connexion avec un mauvais mot de passe
    test('POST /connexion - Échoue avec un mauvais mot de passe', async () => {
        // Note : On utilise 'request(app)' et non 'agent' car on ne veut PAS garder de session

        // On suppose que l'utilisateur 'testadmin' existe (créé dans le bloc 'beforeAll' des tests admin)
        // Mais ce test pourrait être plus robuste en s'assurant qu'il existe d'abord.
        // Pour l'instant, on se fie à l'ordre d'exécution (le bloc 'beforeAll' s'exécute avant).

        const response = await request(app)
            .post('/connexion')
            .send({
                username: 'testadmin',
                password: 'mauvaismotdepasse' // On envoie un mot de passe incorrect
            });

        // On s'attend à un statut 200 (OK), car la route `POST /connexion`
        // ne renvoie pas d'erreur 401, elle *re-affiche la page de connexion*
        expect(response.statusCode).toBe(200);

        // On vérifie que la page de connexion rechargée contient un message d'erreur
        expect(response.text).toContain("Nom d&#39;utilisateur ou mot de passe incorrect.");
    })
});

describe('Tests des routes admin (authentifié)', () => {
    
    let agent;
    const adminUser = {
        username: 'testadmin',
        password: 'password123!',
        email: 'admin@test.com'
    };
    let tagIds = [];

    // 'beforeAll' s'exécute UNE SEULE FOIS avant tous les tests de ce bloc
    beforeAll(async () => {
        // 1. Crée un agent qui va garder les cookies de session
        agent = request.agent(app);

        // 2. Crée le compte admin
        // La BDD est en mémoire, on doit donc créer l'admin à chaque 'npm test'
        // Notre route checkAdminExists autorise la création car la BDD est vide
        await agent
            .post('/inscription')
            .send({
                username: adminUser.username,
                password: adminUser.password,
                email: adminUser.email
            });
            // On ignore la réponse, on suppose que ça marche (on pourrait la tester)

        // 3. Connecte l'agent
        await agent
            .post('/connexion')
            .send({
                username: adminUser.username,
                password: adminUser.password
            });
            // L'agent a maintenant le cookie de session et est authentifié

        // --- NOUVEAU : 4. Créer les tags de test dans la BDD en mémoire ---
        const tagNames = ['Test', 'Jest', 'JavaScript'];
        // On crée les tags un par un pour récupérer leurs IDs
        const tagPromises = tagNames.map(name => {
            return new Promise((resolve, reject) => {
                // On simule la logique de création de tag (FR et EN identiques)
                db.run('INSERT INTO tags (name_fr, name_en) VALUES (?, ?)', [name, name], function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID); // Renvoie le nouvel ID
                });
            });
        });
        tagIds = await Promise.all(tagPromises); // tagIds sera [1, 2, 3]
    });

    // Test 7: L'agent connecté peut accéder à la page admin
    test('GET /admin - Doit répondre avec un statut 200 (OK)', async () => {
        // On utilise l'agent (connecté) pour faire la requête
        const response = await agent.get('/admin');

        expect(response.statusCode).toBe(200);
        // On peut même vérifier qu'on est sur la bonne page// On peut même vérifier qu'on est sur la bonne page
        expect(response.text).toContain("Panneau d&#39;Administration");
    });

    // Test 8: L'agent connecté peut accéder à la page de création d'article
    test('GET /journal/nouvelle - Doit répondre avec un statut 200 (OK)', async () => {
        const response = await agent.get('/journal/nouvelle');

        expect(response.statusCode).toBe(200);
        expect(response.text).toContain("Ajouter une entrée"); // Ou une clé de traduction
    });

    // Test 9: L'agent connecté peut accéder à la page de gestion des tags
    test('GET /admin/tags - Doit répondre avec un statut 200 (OK)', async () => {
        const response = await agent.get('/admin/tags');

        expect(response.statusCode).toBe(200);
        expect(response.text).toContain("Gérer les Tags");
    });

    // Test 10: L'agent connecté peut créer une nouvelle entrée
    test('POST /journal - Peut créer une nouvelle entrée et la vérifie en BDD', async () => {
        // Les données de notre nouvelle entrée
        const newEntry = {
            title_fr: 'Titre de Test (Jest)',
            title_en: 'Test Title (Jest)',
            content_fr: '# Un test\nContenu français.',
            content_en: '# A test\nEnglish content.',
            cover_image_url: 'http://example.com/image.jpg',
            tags: tagIds
        };

        // 1. On envoie la requête POST pour créer l'entrée
        const response = await agent.post('/journal').send(newEntry);

        // 2. On vérifie que le serveur nous redirige vers le journal (Statut 302)
        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe('/journal');

        // 3. On vérifie la base de données (l'étape la plus importante)
        // On doit envelopper l'appel à 'db.get' dans une Promesse pour utiliser 'await'
        const savedEntry = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM articles WHERE title_fr = ?', [newEntry.title_fr], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        // 4. On vérifie que l'entrée existe et que les données correspondent
        expect(savedEntry).toBeDefined(); // S'assure qu'on a bien trouvé l'entrée
        expect(savedEntry.title_en).toBe(newEntry.title_en);
        expect(savedEntry.cover_image_url).toBe(newEntry.cover_image_url);

        // 5. On vérifie les tags
        const savedTags = await new Promise((resolve, reject) => {
            db.all(
                'SELECT t.name_fr FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ?',
                [savedEntry.id],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows.map(r => r.name_fr)); // Renvoie un tableau des noms de tags
                }
            );
        });

        expect(savedTags).toHaveLength(3); // On s'attend à 3 tags
        expect(savedTags).toContain('Test');
        expect(savedTags).toContain('Jest');


    });

    // Test 11: La création échoue si des champs requis sont manquants
    test('POST /journal - Échoue (Statut 500) si le titre est manquant', async () => {
        // Données invalides (il manque title_fr, qui est NOT NULL)
        const badEntry = {
            title_en: 'Bad Test Title',
            content_fr: 'Contenu...',
            content_en: 'Content...',
        };

        // 1. On envoie la requête POST invalide
        const response = await agent.post('/journal').send(badEntry);

        // 2. On s'attend à une erreur.
        // Notre route renvoie 500 si la BDD échoue (à cause de la contrainte NOT NULL)
        expect(response.statusCode).toBe(500);

        // 3. On vérifie que le serveur n'a PAS redirigé (ce qui signifierait un faux succès)
        expect(response.headers.location).not.toBe('/journal');
    });

    // Test 12: L'agent connecté peut supprimer une entrée
    test('POST /entree/:id/delete - Peut supprimer une entrée et ses liaisons de tags', async () => {

        // 1. CRÉATION D'UNE ENTRÉE DE TEST DANS LA BDD
        // On doit créer une entrée que l'on pourra supprimer
        const entryData = {
            title_fr: 'Article à Supprimer', title_en: 'Delete Me',
            content_fr: 'Contenu FR', content_en: 'Contenu EN',
            user_id: 1 // On peut supposer 1, l'admin créé dans beforeAll
        };

        const creationResult = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id) VALUES (?, ?, ?, ?, ?)',
                [entryData.title_fr, entryData.title_en, entryData.content_fr, entryData.content_en, entryData.user_id],
                function(err) {
                    if (err) reject(err);
                    resolve({ id: this.lastID }); // Renvoie l'ID de l'article créé
                }
            );
        });

        const entryIdToDelete = creationResult.id;

        // 1b. On lie un tag à cette entrée pour tester le "ON DELETE CASCADE"
        const tagId = 1; // On utilise le tag 'Test' (ID 1) créé dans le beforeAll
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)', [entryIdToDelete, tagId], (err) => {
                if (err) reject(err);
                resolve();
            });
        });

        // 2. ENVOI DE LA REQUÊTE DE SUPPRESSION
        // On utilise l'agent (connecté) pour faire la requête
        const response = await agent.post(`/entree/${entryIdToDelete}/delete`);

        // 3. VÉRIFICATION DE LA RÉPONSE SERVEUR
        expect(response.statusCode).toBe(302); // S'attend à une redirection
        expect(response.headers.location).toBe('/journal'); // Vers la page du journal

        // 4. VÉRIFICATION DE LA BASE DE DONNÉES (L'étape la plus importante)

        // a) L'article doit avoir disparu
        const deletedEntry = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM articles WHERE id = ?', [entryIdToDelete], (err, row) => {
                if (err) reject(err);
                resolve(row); // 'row' sera 'undefined' si l'article n'existe plus
            });
        });
        expect(deletedEntry).toBeUndefined(); // Confirme que l'article est supprimé

        // b) Les liaisons de tags doivent avoir disparu (grâce à ON DELETE CASCADE)
        const deletedLinks = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM article_tags WHERE article_id = ?', [entryIdToDelete], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        expect(deletedLinks).toHaveLength(0); // Confirme que les liens sont supprimés
    });

    // Test 13: L'agent connecté peut modifier une entrée
    test('POST /entree/:id/edit - Peut modifier une entrée et mettre à jour les tags', async () => {

        // 1. CRÉATION D'UNE ENTRÉE DE TEST DANS LA BDD
        const entryData = {
            title_fr: 'Article à Modifier', title_en: 'Edit Me',
            content_fr: 'Contenu Original FR', content_en: 'Contenu Original EN',
            user_id: 1 // Admin
        };
        const creationResult = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO articles (title_fr, title_en, content_fr, content_en, user_id) VALUES (?, ?, ?, ?, ?)',
                [entryData.title_fr, entryData.title_en, entryData.content_fr, entryData.content_en, entryData.user_id],
                function(err) { if (err) reject(err); resolve({ id: this.lastID }); }
            );
        });
        const entryIdToEdit = creationResult.id;

        // On lie un tag ('Test', ID 1) à cette entrée
        const originalTagId = tagIds[0]; // 'tagIds' vient du beforeAll (ex: [1, 2, 3])
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)', [entryIdToEdit, originalTagId], (err) => {
                if (err) reject(err); resolve();
            });
        });

        // 2. PRÉPARATION DES DONNÉES DE MISE À JOUR
        // On va changer le titre EN et les tags
        const updatedData = {
            title_fr: 'Article à Modifier', // Garde le même
            title_en: 'EDITED TITLE', // Nouveau titre EN
            content_fr: 'Contenu Original FR', // Garde le même
            content_en: 'Contenu Original EN', // Garde le même
            cover_image_url: 'http://example.com/new-image.jpg', // Nouvelle image
            tags: [tagIds[1], tagIds[2]] // Nouveaux tags (ID 2 et 3)
        };

        // 3. ENVOI DE LA REQUÊTE DE MISE À JOUR
        // On utilise l'agent (connecté)
        const response = await agent
            .post(`/entree/${entryIdToEdit}/edit`)
            .send(updatedData);

        // 4. VÉRIFICATION DE LA RÉPONSE SERVEUR
        expect(response.statusCode).toBe(302); // Redirection
        expect(response.headers.location).toBe('/journal');

        // 5. VÉRIFICATION DE LA BASE DE DONNÉES

        // a) L'article doit être mis à jour
        const updatedEntry = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM articles WHERE id = ?', [entryIdToEdit], (err, row) => {
                if (err) reject(err); resolve(row);
            });
        });
        expect(updatedEntry).toBeDefined();
        expect(updatedEntry.title_en).toBe('EDITED TITLE'); // Vérifie le titre EN
        expect(updatedEntry.cover_image_url).toBe('http://example.com/new-image.jpg'); // Vérifie l'image

        // b) Les tags doivent être mis à jour
        const updatedTags = await new Promise((resolve, reject) => {
            db.all(
                'SELECT t.name_fr FROM tags t JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ? ORDER BY t.id',
                [entryIdToEdit],
                (err, rows) => {
                    if (err) reject(err); resolve(rows.map(r => r.name_fr));
                }
            );
        });

        expect(updatedTags).toHaveLength(2); // Doit avoir 2 tags
        expect(updatedTags).toContain('Jest'); // 'Jest' (ID 2)
        expect(updatedTags).toContain('JavaScript'); // 'JavaScript' (ID 3)
        expect(updatedTags).not.toContain('Test'); // L'ancien tag 'Test' (ID 1) doit avoir disparu
    });
});