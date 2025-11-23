document.addEventListener('DOMContentLoaded', () => {
    // Champs cachés du formulaire (ceux qui partent au serveur)
    const nameInput = document.getElementById('author_name');
    const emailInput = document.getElementById('author_email');
    const avatarStyleInput = document.getElementById('author_avatar_style');

    // Éléments d'interface (Boutons et Badges)
    const loginView = document.getElementById('guest-login-view');
    const profileView = document.getElementById('guest-profile-view');
    const loginBtn = document.getElementById('guest-login-btn');
    const editBtn = document.getElementById('guest-edit-btn');
    const logoutBtn = document.getElementById('guest-logout-btn'); // Bouton déconnexion

    const displayName = document.getElementById('display-guest-name');
    const displayEmail = document.getElementById('display-guest-email');

    const commentForm = document.querySelector('.comment-form form');

    // Si on est sur une page sans formulaire visiteur (ex: admin connecté), on arrête le script
    if (!nameInput || !loginView) return;

    // --- 1. FONCTION : Pop-up de configuration (SweetAlert2) ---
    const promptForGuestInfo = async () => {
        // Récupère les valeurs actuelles ou vides
        const storedName = localStorage.getItem('blog_guest_username') || '';
        const storedEmail = localStorage.getItem('blog_guest_email') || '';
        const storedStyle = localStorage.getItem('blog_guest_avatar_style') || 'bottts'; // Style par défaut

        const { value: formValues } = await Swal.fire({
            title: 'Créer votre profil invité',
            html:
                `<p style="font-size:0.9rem; color:#666; margin-bottom:1rem;">Ces informations sont mémorisées dans votre navigateur pour vos futurs commentaires.</p>` +
                `<input id="swal-input-name" class="swal2-input" placeholder="Pseudo" value="${storedName}">` +
                `<input id="swal-input-email" class="swal2-input" type="email" placeholder="Email (privé)" value="${storedEmail}">` +
                `<label style="display:block; margin-top:15px; font-weight:bold; color: var(--c-text);">Choisissez votre avatar :</label>` +
                `<select id="swal-input-style" class="swal2-input" style="margin-top:5px;">
                    <option value="bottts" ${storedStyle === 'bottts' ? 'selected' : ''}>🤖 Robots</option>
                    <option value="avataaars" ${storedStyle === 'avataaars' ? 'selected' : ''}>🧑 Humains</option>
                    <option value="monsterrr" ${storedStyle === 'monsterrr' ? 'selected' : ''}>👾 Monstres</option>
                    <option value="identicon" ${storedStyle === 'identicon' ? 'selected' : ''}>🔷 Géométrique</option>
                    <option value="initials" ${storedStyle === 'initials' ? 'selected' : ''}>🅰️ Initiales</option>
                </select>`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Enregistrer',
            cancelButtonText: 'Annuler',
            confirmButtonColor: 'var(--c-primary)',
            cancelButtonColor: '#6c757d',
            preConfirm: () => {
                const name = document.getElementById('swal-input-name').value;
                const email = document.getElementById('swal-input-email').value;
                const style = document.getElementById('swal-input-style').value;

                if (!name || !email) {
                    Swal.showValidationMessage('Le pseudo et l\'email sont requis');
                    return false;
                }
                return { name, email, style }; 
            }
        });

        if (formValues) {
            // Sauvegarde dans le navigateur
            localStorage.setItem('blog_guest_username', formValues.name);
            localStorage.setItem('blog_guest_email', formValues.email);
            localStorage.setItem('blog_guest_avatar_style', formValues.style);

            // Met à jour l'affichage immédiatement
            updateUI();

            Swal.fire({
                icon: 'success',
                title: 'Profil prêt !',
                text: `Bienvenue, ${formValues.name}.`,
                timer: 2000,
                showConfirmButton: false
            });
        }
    };

    // --- 2. FONCTION : Mise à jour de l'interface (Login vs Profil) ---
    const updateUI = () => {
        const name = localStorage.getItem('blog_guest_username');
        const email = localStorage.getItem('blog_guest_email');
        const style = localStorage.getItem('blog_guest_avatar_style') || 'bottts';

        if (name && email) {
            // --- ÉTAT : CONNECTÉ ---

            // 1. Remplir les champs cachés pour l'envoi
            nameInput.value = name;
            emailInput.value = email;
            if (avatarStyleInput) avatarStyleInput.value = style;

            // 2. Mettre à jour le badge visuel
            if (displayName) {
                // Génère l'URL de l'avatar pour l'aperçu
                const avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(name)}`;
                displayName.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width:24px; height:24px; vertical-align:middle; border-radius:50%; margin-right:8px; border:1px solid #ccc;"> ${name}`;
            }
            if (displayEmail) displayEmail.textContent = email;

            // 3. Basculer les vues
            loginView.style.display = 'none';
            profileView.style.display = 'flex'; // Flex pour aligner le texte et les boutons
        } else {
            // --- ÉTAT : DÉCONNECTÉ ---

            // 1. Vider les champs cachés
            nameInput.value = '';
            emailInput.value = '';
            if (avatarStyleInput) avatarStyleInput.value = '';

            // 2. Basculer les vues
            loginView.style.display = 'block';
            profileView.style.display = 'none';
        }
    };

    // --- 3. FONCTION : Déconnexion ---
    const handleLogout = () => {
        Swal.fire({
            title: 'Oublier mes infos ?',
            text: "Vos informations invité seront effacées de ce navigateur.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Oui, effacer',
            cancelButtonText: 'Annuler'
        }).then((result) => {
            if (result.isConfirmed) {
                // Effacer le Local Storage
                localStorage.removeItem('blog_guest_username');
                localStorage.removeItem('blog_guest_email');
                localStorage.removeItem('blog_guest_avatar_style');

                // Mettre à jour l'interface
                updateUI();

                Swal.fire({
                    icon: 'success',
                    title: 'Déconnecté',
                    text: 'Vos informations ont été oubliées.',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    };

    // --- 4. INITIALISATION & ÉVÉNEMENTS ---

    // Charge l'état au démarrage de la page
    updateUI();

    // Clic sur "S'identifier" ou "Modifier"
    if (loginBtn) loginBtn.addEventListener('click', promptForGuestInfo);
    if (editBtn) editBtn.addEventListener('click', promptForGuestInfo);

    // Clic sur "Déconnexion"
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Interception de l'envoi du formulaire si l'utilisateur n'est pas identifié
    if (commentForm) {
        commentForm.addEventListener('submit', (e) => {
            // Si le champ caché "nom" est vide, c'est qu'on n'est pas connecté
            if (!nameInput.value || !emailInput.value) {
                e.preventDefault(); // Bloque l'envoi

                Swal.fire({
                    icon: 'info',
                    title: 'Identification requise',
                    text: 'Veuillez configurer votre profil invité pour commenter.',
                    confirmButtonText: 'Configurer',
                    confirmButtonColor: 'var(--c-primary)'
                }).then((res) => {
                    if (res.isConfirmed) promptForGuestInfo();
                });
            }
        });
    }
});