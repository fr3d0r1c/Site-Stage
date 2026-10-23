const request = require('supertest');

// Mock de Nodemailer (Simule l'envoi d'emails)
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue(true)
  })
}));

// Import de l'application
const { app, db } = require('./app');

// Séquence du Konami code : elle ouvre l'accès caché à la page de connexion
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const unlockLogin = (agent) => agent.post('/api/konami').send({ sequence: KONAMI });

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

    // 3. Connexion de l'Admin (la page de connexion est cachée : on tape d'abord le Konami code)
    await unlockLogin(adminAgent);
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
        const agent = request.agent(app);
        await unlockLogin(agent);
        const res = await agent.post('/connexion').type('form').send({ username: 'personne', password: 'nimportequoi' });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/connexion');
    });

    test('POST /connexion - Corps vide : redirection, pas de plantage', async () => {
        const agent = request.agent(app);
        await unlockLogin(agent);
        const res = await agent.post('/connexion').type('form').send({});
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

    // --- Accès caché à la page de connexion ---
    test('/connexion est introuvable (404) sans le Konami code', async () => {
        expect((await anon().get('/connexion')).statusCode).toBe(404);
        expect((await anon().post('/connexion').type('form').send({ username: 'a', password: 'b' })).statusCode).toBe(404);
        expect((await anon().get('/inscription')).statusCode).toBe(404);
        expect((await anon().get('/forgot-password')).statusCode).toBe(404);
        expect((await anon().post('/forgot-password').type('form').send({ email: 'a@b.cd' })).statusCode).toBe(404);
    });

    test('Les pages admin répondent 404 à un visiteur (pas de redirection vers la connexion)', async () => {
        for (const url of ['/admin', '/admin/dashboard', '/admin/messages', '/journal/nouvelle', '/change-password']) {
            const res = await anon().get(url);
            expect(res.statusCode).toBe(404);
            expect(res.headers.location).toBeUndefined();
        }
    });

    test('Mauvaise séquence : le serveur refuse et /connexion reste cachée', async () => {
        const agent = request.agent(app);
        expect((await agent.post('/api/konami').send({ sequence: ['ArrowUp', 'ArrowUp'] })).statusCode).toBe(404);
        expect((await agent.post('/api/konami').send({ sequence: 'pas un tableau' })).statusCode).toBe(404);
        expect((await agent.post('/api/konami').send({})).statusCode).toBe(404);
        expect((await agent.get('/connexion')).statusCode).toBe(404);
    });

    test('Bonne séquence : /connexion devient accessible pour CETTE session seulement', async () => {
        const agent = request.agent(app);
        const ok = await unlockLogin(agent);
        expect(ok.statusCode).toBe(200);
        expect(ok.body.ok).toBe(true);
        expect((await agent.get('/connexion')).statusCode).toBe(200);
        // Un autre visiteur, lui, ne voit toujours rien
        expect((await anon().get('/connexion')).statusCode).toBe(404);
    });

    test('Le lien de réinitialisation par email reste utilisable sans Konami code', async () => {
        const res = await anon().get('/reset-password/jeton-invalide');
        expect(res.statusCode).toBe(400); // lien invalide, mais la page répond (pas 404)
    });

    test('Pages sensibles envoyées avec noindex ; robots.txt ne les liste plus', async () => {
        const res = await anon().get('/admin/dashboard');
        expect(res.headers['x-robots-tag']).toContain('noindex');
        const robots = await anon().get('/robots.txt');
        const rules = robots.text.split(/\r?\n/).filter(l => /^\s*(Disallow|Allow)/i.test(l)).join(' ');
        expect(rules).not.toMatch(/connexion|admin|inscription/i);
    });
});

// ========================================================
// 4. ARTICLES : corbeille, anglais de secours, validations
// ========================================================
describe('Articles : corbeille et édition', () => {
    const visitor = () => request(app);
    const getRow = (sql, params = []) => new Promise(resolve => db.get(sql, params, (e, r) => resolve(r)));
    const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (e) { e ? reject(e) : resolve(this); }));

    async function createArticle(title, extra = {}) {
        await adminAgent.post('/journal').type('form').send({
            title_fr: title, title_en: title + ' EN',
            content_fr: 'Contenu de ' + title, content_en: 'Content of ' + title,
            action: 'published', ...extra
        });
        return (await getRow('SELECT id FROM articles WHERE title_fr = ?', [title])).id;
    }

    test('La page d\'un article s\'affiche (adresse de partage fournie)', async () => {
        const id = await createArticle('Article visible');
        const res = await visitor().get('/entree/' + id);
        expect(res.statusCode).toBe(200);
        // Le lien de partage contient l'adresse de l'article, encodée pour une URL
        expect(res.text).toContain(encodeURIComponent('/entree/' + id));
    });

    test('Supprimer = mettre à la corbeille : l\'article disparaît du site', async () => {
        const id = await createArticle('Article à supprimer');
        expect((await visitor().get('/entree/' + id)).statusCode).toBe(200);

        const del = await adminAgent.post('/entree/' + id + '/delete');
        expect(del.statusCode).toBe(302);

        // Toujours en base, mais marqué supprimé
        const row = await getRow('SELECT deleted_at FROM articles WHERE id = ?', [id]);
        expect(row).toBeDefined();
        expect(row.deleted_at).not.toBeNull();

        // Introuvable pour tout le monde (visiteur ET admin) sur le site
        expect((await visitor().get('/entree/' + id)).statusCode).toBe(404);
        expect((await adminAgent.get('/entree/' + id)).statusCode).toBe(404);
        expect((await adminAgent.get('/entree/' + id + '/edit')).statusCode).toBe(404);
        expect((await visitor().get('/journal')).text).not.toContain('Article à supprimer');
        expect((await adminAgent.get('/journal')).text).not.toContain('Article à supprimer');
        expect((await visitor().get('/api/search').query({ q: 'Article à supprimer' })).body).toEqual([]);
        expect((await visitor().get('/sitemap.xml')).text).not.toContain('/entree/' + id + '<');
    });

    test('La corbeille liste l\'article ; le restaurer le remet en ligne', async () => {
        const id = await createArticle('Article restaurable');
        await adminAgent.post('/entree/' + id + '/delete');

        const trash = await adminAgent.get('/admin/trash');
        expect(trash.statusCode).toBe(200);
        expect(trash.text).toContain('Article restaurable');

        const restore = await adminAgent.post('/admin/trash/restore/' + id);
        expect(restore.statusCode).toBe(302);
        expect((await visitor().get('/entree/' + id)).statusCode).toBe(200);
        expect((await getRow('SELECT deleted_at FROM articles WHERE id = ?', [id])).deleted_at).toBeNull();
    });

    test('Suppression définitive : seulement depuis la corbeille', async () => {
        const live = await createArticle('Article en ligne');
        // Un article NON supprimé ne peut pas être purgé directement
        await adminAgent.post('/admin/trash/purge/' + live);
        expect(await getRow('SELECT id FROM articles WHERE id = ?', [live])).toBeDefined();

        await adminAgent.post('/entree/' + live + '/delete');
        await adminAgent.post('/admin/trash/purge/' + live);
        expect(await getRow('SELECT id FROM articles WHERE id = ?', [live])).toBeUndefined();
    });

    test('Vider la corbeille', async () => {
        const id = await createArticle('Article à vider');
        await adminAgent.post('/entree/' + id + '/delete');
        await adminAgent.post('/admin/trash/empty');
        expect(await getRow('SELECT COUNT(*) AS n FROM articles WHERE deleted_at IS NOT NULL')).toEqual({ n: 0 });
    });

    test('Les articles restés plus de 30 jours à la corbeille sont effacés automatiquement', async () => {
        const old = await createArticle('Article très ancien');
        const recent = await createArticle('Article récent');
        await run("UPDATE articles SET deleted_at = datetime('now', '-40 days') WHERE id = ?", [old]);
        await run("UPDATE articles SET deleted_at = datetime('now', '-5 days') WHERE id = ?", [recent]);

        const { purgeExpiredTrash } = require('./app');
        purgeExpiredTrash();
        await new Promise(resolve => setTimeout(resolve, 300));

        expect(await getRow('SELECT id FROM articles WHERE id = ?', [old])).toBeUndefined();
        expect(await getRow('SELECT id FROM articles WHERE id = ?', [recent])).toBeDefined();
    });

    test('Un visiteur ne peut ni voir la corbeille ni supprimer', async () => {
        const id = await createArticle('Article protégé');
        expect((await visitor().get('/admin/trash')).statusCode).toBe(404);
        expect((await visitor().post('/entree/' + id + '/delete')).statusCode).toBe(404);
        expect((await visitor().post('/admin/trash/purge/' + id)).statusCode).toBe(404);
        expect((await getRow('SELECT deleted_at FROM articles WHERE id = ?', [id])).deleted_at).toBeNull();
    });

    test('Un commentaire ne peut pas être posté sur un article à la corbeille', async () => {
        const id = await createArticle('Article commentaire');
        await adminAgent.post('/entree/' + id + '/delete');
        const before = (await getRow('SELECT COUNT(*) AS n FROM comments')).n;
        await visitor().post('/article/' + id + '/comment').type('form').send({ author_name: 'Zoé', author_email: 'zoe@test.com', content: 'Coucou' });
        expect((await getRow('SELECT COUNT(*) AS n FROM comments')).n).toBe(before);
    });

    test('Anglais vide : complété par le serveur (copie du français sans clé DeepL)', async () => {
        await adminAgent.post('/journal').type('form').send({
            title_fr: 'Titre sans anglais', title_en: '', content_fr: 'Corps sans anglais', content_en: '', action: 'published'
        });
        const row = await getRow("SELECT title_en, content_en FROM articles WHERE title_fr = 'Titre sans anglais'");
        expect(row.title_en).toBe('Titre sans anglais');
        expect(row.content_en).toBe('Corps sans anglais');
    });

    test('Un message d\'erreur de traduction n\'est jamais enregistré comme texte anglais', async () => {
        await adminAgent.post('/journal').type('form').send({
            title_fr: 'Titre erreur trad', title_en: 'Translation Error.', content_fr: 'Corps', content_en: 'Translating...', action: 'published'
        });
        const row = await getRow("SELECT title_en, content_en FROM articles WHERE title_fr = 'Titre erreur trad'");
        expect(row.title_en).not.toMatch(/Translation Error|Translating/);
        expect(row.content_en).not.toMatch(/Translation Error|Translating/);
    });

    test('Adresse de couverture dangereuse (javascript:) refusée', async () => {
        await adminAgent.post('/journal').type('form').send({
            title_fr: 'Couverture piégée', title_en: 'x', content_fr: 'a', content_en: 'b', cover_image_url: 'javascript:alert(1)', action: 'published'
        });
        expect(await getRow("SELECT id FROM articles WHERE title_fr = 'Couverture piégée'")).toBeUndefined();
    });

    test('Modification : les changements sont enregistrés', async () => {
        const id = await createArticle('Avant modification');
        const res = await adminAgent.post('/entree/' + id + '/edit').type('form').send({
            title_fr: 'Après modification', title_en: 'After edit', content_fr: 'Nouveau corps', content_en: 'New body',
            cover_image_url: '/uploads/exemple.webp', action: 'published'
        });
        expect(res.statusCode).toBe(302);
        const row = await getRow('SELECT title_fr, cover_image_url FROM articles WHERE id = ?', [id]);
        expect(row.title_fr).toBe('Après modification');
        expect(row.cover_image_url).toBe('/uploads/exemple.webp');
    });
});
