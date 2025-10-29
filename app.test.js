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
        expect(response.statusCode).toBe(200);
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
});

describe('Tests des routes admin (authentifié)', () => {
    
    let agent;
    const adminUser = {
        username: 'testadmin',
        password: 'password123!',
        email: 'admin@test.com'
    };

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
});