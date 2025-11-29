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