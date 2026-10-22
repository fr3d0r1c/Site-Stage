const request = require('supertest');

// Mock de Nodemailer (Simule l'envoi d'emails)
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue(true)
  })
}));

// Import de l'application
const { app, db } = require('./app');

// Agent global pour l'Admin
let adminAgent = request.agent(app);
let articleId;

// --- CONFIGURATION INITIALE ---
beforeAll(async () => {
    // 1. Attente BDD
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 2. Création Admin manuel (Bypass 2FA/Inscription pour le test)
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('password123', 10);
    
    await new Promise((resolve, reject) => {
        db.run("INSERT OR IGNORE INTO users (username, password, email, two_fa_enabled, two_fa_prompted) VALUES ('testadmin', ?, 'test@test.com', 0, 1)", 
        [hash], (err) => {
            if (err) reject(err); else resolve();
        });
    });

    // 3. Connexion de l'Admin
    await adminAgent
        .post('/connexion')
        .type('form')
        .send({ username: 'testadmin', password: 'password123' });
});

afterAll((done) => {
    db.close(() => {
        console.log("Connexion BDD de test fermée.");
        done();
    });
});

// ========================================================
// 1. TESTS ADMIN & CONTENU (Existants)
// ========================================================
describe('Administration & Blog', () => {

    test('POST /journal - Création d\'un article', async () => {
        const res = await adminAgent
            .post('/journal')
            .type('form')
            .send({
                title_fr: 'Article Social',
                title_en: 'Social Article',
                content_fr: 'Contenu pour tester les likes.',
                content_en: 'Content for testing likes.',
                summary_fr: 'Résumé',
                action: 'published'
            });
            
        expect(res.statusCode).toBe(302);
        
        // Récupération ID
        const row = await new Promise(resolve => {
            db.get("SELECT id FROM articles WHERE title_fr = 'Article Social'", (err, row) => resolve(row));
        });
        articleId = row.id;
        expect(articleId).toBeDefined();
    });
});

// ========================================================
// 2. TESTS INVITÉ & SOCIAL (Nouveaux !)
// ========================================================
describe('Fonctionnalités Invité & Social', () => {
    let guestAgent = request.agent(app); // Un nouvel agent "Visiteur"
    let commentId;

    // 1. Connexion / Création Profil
    test('POST /guest/login - Créer un profil invité', async () => {
        const res = await guestAgent
            .post('/guest/login')
            .type('form')
            .send({ name: 'GuestUser', email: 'guest@test.com', avatar_style: 'bottts' });
        
        expect(res.statusCode).toBe(302);
        // Vérifie que le cookie a été posé
        const cookies = res.headers['set-cookie'];
        const guestCookie = cookies.find(c => c.startsWith('guest_token='));

        expect(guestCookie).toBeDefined();
    });

    // 2. Système de Likes (Toggle)
    test('POST /api/entree/:id/like - Ajouter un like', async () => {
        const res = await guestAgent.post(`/api/entree/${articleId}/like`);
        expect(res.statusCode).toBe(200);
        expect(res.body.liked).toBe(true);
        expect(res.body.likes).toBe(1);
    });

    test('POST /api/entree/:id/like - Retirer le like', async () => {
        const res = await guestAgent.post(`/api/entree/${articleId}/like`);
        expect(res.statusCode).toBe(200);
        expect(res.body.liked).toBe(false);
        expect(res.body.likes).toBe(0);
    });

    // 3. Commentaires
    test('POST /article/:id/comment - Poster un commentaire', async () => {
        const res = await guestAgent
            .post(`/article/${articleId}/comment`)
            .type('form')
            .send({
                author_name: 'GuestUser',
                author_email: 'guest@test.com',
                author_avatar_style: 'bottts',
                content: 'Mon commentaire de test.'
            });
            
        expect(res.statusCode).toBe(302);
        
        // Vérif BDD
        const row = await new Promise(resolve => {
            db.get('SELECT id FROM comments WHERE content = ?', ['Mon commentaire de test.'], (err, row) => resolve(row));
        });
        commentId = row.id;
        expect(commentId).toBeDefined();
    });

    // 4. Suppression (Propriétaire)
    test('POST /admin/comments/delete/:id - Supprimer son propre commentaire', async () => {
        // L'invité essaie de supprimer SON commentaire (doit marcher grâce au cookie guest_token)
        const res = await guestAgent.post(`/admin/comments/delete/${commentId}`);
        expect(res.statusCode).toBe(302);
        
        // Vérif suppression
        const row = await new Promise(resolve => {
            db.get('SELECT id FROM comments WHERE id = ?', [commentId], (err, row) => resolve(row));
        });
        expect(row).toBeUndefined();
    });

    // 5. Déconnexion
    test('GET /guest/logout - Se déconnecter', async () => {
        const res = await guestAgent.get('/guest/logout');
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/');
    });
});
// ========================================================
// 3. TESTS DE SÉCURITÉ / NON-RÉGRESSION
// ========================================================
describe('Sécurité & robustesse', () => {
    const anon = () => request(app);
    let draftId;

    const countComments = () => new Promise(resolve => {
        db.get('SELECT COUNT(*) AS n FROM comments', (err, row) => resolve(row.n));
    });

    test('POST /connexion - Utilisateur inconnu : redirection, pas de plantage', async () => {
        const res = await anon().post('/connexion').type('form').send({ username: 'personne', password: 'nimportequoi' });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/connexion');
    });

    test('POST /connexion - Corps vide : redirection, pas de plantage', async () => {
        const res = await anon().post('/connexion').type('form').send({});
        expect(res.statusCode).toBe(302);
    });

    test('Les routes de debug n\'existent plus', async () => {
        expect((await anon().get('/debug-write')).statusCode).toBe(404);
        expect((await anon().get('/debug-read')).statusCode).toBe(404);
        expect((await anon().get('/test-helper')).statusCode).toBe(404);
    });

    test('Un brouillon est invisible pour un visiteur (page, recherche, sitemap)', async () => {
        await adminAgent.post('/journal').type('form').send({
            title_fr: 'Brouillon secret', title_en: 'Secret draft',
            content_fr: 'Contenu brouillon unique-xyz', content_en: 'Draft content unique-xyz',
            action: 'draft'
        });
        const row = await new Promise(resolve => db.get("SELECT id FROM articles WHERE title_fr = 'Brouillon secret'", (e, r) => resolve(r)));
        draftId = row.id;

        expect((await anon().get(`/entree/${draftId}`)).statusCode).toBe(404);
        // L'admin, lui, peut le voir
        expect((await adminAgent.get(`/entree/${draftId}`)).statusCode).toBe(200);

        const search = await anon().get('/api/search').query({ q: 'unique-xyz' });
        expect(search.body).toEqual([]);

        const sitemap = await anon().get('/sitemap.xml');
        expect(sitemap.statusCode).toBe(200);
        expect(sitemap.text).not.toContain(`/entree/${draftId}`);
    });

    test('Un identifiant d\'article invalide renvoie 404 (pas d\'erreur serveur)', async () => {
        expect((await anon().get('/entree/abc')).statusCode).toBe(404);
        expect((await anon().get('/entree/1%27%20OR%201=1')).statusCode).toBe(404);
    });

    test('Commentaire sans email valide : rejeté, rien en base', async () => {
        const before = await countComments();
        await anon().post(`/article/${articleId}/comment`).type('form').send({ author_name: 'Bob', author_email: 'pas-un-email', content: 'Salut' });
        expect(await countComments()).toBe(before);
    });

    test('Commentaire grossier : rejeté, rien en base', async () => {
        const before = await countComments();
        await anon().post(`/article/${articleId}/comment`).type('form').send({ author_name: 'Bob', author_email: 'bob@test.com', content: 'testbad' });
        expect(await countComments()).toBe(before);
    });

    test('Un visiteur ne peut pas usurper le pseudo de l\'admin', async () => {
        const before = await countComments();
        await anon().post(`/article/${articleId}/comment`).type('form').send({ author_name: 'TestAdmin', author_email: 'faux@test.com', content: 'Je suis l\'admin' });
        expect(await countComments()).toBe(before);
    });

    test('Suppression de commentaire : returnTo externe ignoré', async () => {
        const res = await anon().post('/admin/comments/delete/999999?returnTo=https://evil.example/phishing');
        expect(res.statusCode).toBe(302);
        expect(res.headers.location.startsWith('/')).toBe(true);
        expect(res.headers.location.startsWith('//')).toBe(false);
    });

    test('Profil invité : un style d\'avatar libre est remplacé par une valeur sûre', async () => {
        const agent = request.agent(app);
        await agent.post('/guest/login').type('form').send({ name: 'Mallory', email: 'mallory@test.com', avatar_style: '../../evil' });
        const row = await new Promise(resolve => db.get("SELECT avatar_style FROM guests WHERE email = 'mallory@test.com'", (e, r) => resolve(r)));
        expect(row.avatar_style).toBe('bottts');
    });

    test('Contenu Markdown : les scripts sont retirés de la page article', async () => {
        await adminAgent.post('/journal').type('form').send({
            title_fr: 'Test XSS', title_en: 'XSS test',
            content_fr: 'Bonjour <script>alert(1)</script> <img src=x onerror=alert(2)> [lien](javascript:alert(3))',
            content_en: 'Hello', action: 'published'
        });
        const row = await new Promise(resolve => db.get("SELECT id FROM articles WHERE title_fr = 'Test XSS'", (e, r) => resolve(r)));
        const res = await anon().get(`/entree/${row.id}`);
        expect(res.statusCode).toBe(200);
        // On ne regarde que le corps de l'article (la balise <meta description> contient le texte brut, échappé)
        const start = res.text.indexOf('class="article-content"');
        const body = res.text.slice(start, res.text.indexOf('article-footer-actions', start));
        expect(body).toContain('Bonjour');
        expect(body).not.toContain('<script');
        expect(body).not.toContain('onerror');
        expect(body).not.toContain('javascript:');
    });

    test('Article invalide (titre manquant) : refusé', async () => {
        const before = await new Promise(resolve => db.get('SELECT COUNT(*) AS n FROM articles', (e, r) => resolve(r.n)));
        await adminAgent.post('/journal').type('form').send({ title_fr: '', title_en: '', content_fr: 'x', content_en: 'y' });
        const after = await new Promise(resolve => db.get('SELECT COUNT(*) AS n FROM articles', (e, r) => resolve(r.n)));
        expect(after).toBe(before);
    });

    test('Contact : champs invalides refusés avec un code 400', async () => {
        const res = await anon().post('/contact').type('form').send({ name: 'X', email: 'pas-un-email', subject: 'Sujet', message: 'Message' });
        expect(res.statusCode).toBe(400);
    });

    test('Newsletter : email invalide refusé, rien en base', async () => {
        await anon().post('/newsletter/subscribe').type('form').send({ email: 'nimportequoi' });
        const n = await new Promise(resolve => db.get("SELECT COUNT(*) AS n FROM subscribers WHERE email = 'nimportequoi'", (e, r) => resolve(r.n)));
        expect(n).toBe(0);
    });
});
