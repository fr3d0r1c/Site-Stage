document.addEventListener('DOMContentLoaded', () => {
    // Les champs cachés
    const hiddenName = document.getElementById('author_name');
    const hiddenEmail = document.getElementById('author_email');
    
    // L'interface
    const loginView = document.getElementById('guest-login-view');
    const profileView = document.getElementById('guest-profile-view');
    const loginBtn = document.getElementById('guest-login-btn');
    const editBtn = document.getElementById('guest-edit-btn');
    
    const displayName = document.getElementById('display-guest-name');
    const displayEmail = document.getElementById('display-guest-email');
    
    const commentForm = document.querySelector('.comment-form form');

    // Si on est admin, ces éléments n'existent pas, on arrête.
    if (!hiddenName || !loginView) return;

    // --- 1. FONCTION : Pop-up de configuration ---
    const promptForGuestInfo = async () => {
        const storedName = localStorage.getItem('blog_guest_username') || '';
        const storedEmail = localStorage.getItem('blog_guest_email') || '';

        const { value: formValues } = await Swal.fire({
            title: 'Identification Invité',
            html:
                `<p style="font-size:0.9rem; color:#666; margin-bottom:1rem;">Entrez un pseudo et un email pour poster.</p>` +
                `<input id="swal-input-name" class="swal2-input" placeholder="Pseudo" value="${storedName}">` +
                `<input id="swal-input-email" class="swal2-input" type="email" placeholder="Email (privé)" value="${storedEmail}">`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Valider',
            cancelButtonText: 'Annuler',
            preConfirm: () => {
                const name = document.getElementById('swal-input-name').value;
                const email = document.getElementById('swal-input-email').value;
                if (!name || !email) {
                    Swal.showValidationMessage('Les deux champs sont requis');
                    return false;
                }
                return { name, email };
            }
        });

        if (formValues) {
            // Sauvegarde
            localStorage.setItem('blog_guest_username', formValues.name);
            localStorage.setItem('blog_guest_email', formValues.email);
            updateUI();
        }
    };

    // --- 2. FONCTION : Mise à jour de l'interface ---
    const updateUI = () => {
        const name = localStorage.getItem('blog_guest_username');
        const email = localStorage.getItem('blog_guest_email');

        if (name && email) {
            // État : CONNECTÉ
            hiddenName.value = name;
            hiddenEmail.value = email;
            
            displayName.textContent = name;
            displayEmail.textContent = email;
            
            loginView.style.display = 'none';
            profileView.style.display = 'flex'; // Flex pour aligner le texte et le bouton edit
        } else {
            // État : DÉCONNECTÉ
            hiddenName.value = '';
            hiddenEmail.value = '';
            
            loginView.style.display = 'block';
            profileView.style.display = 'none';
        }
    };

    // --- 3. INITIALISATION ---
    updateUI();

    // --- 4. ÉVÉNEMENTS ---
    if (loginBtn) loginBtn.addEventListener('click', promptForGuestInfo);
    if (editBtn) editBtn.addEventListener('click', promptForGuestInfo);

    // Interception de l'envoi si l'utilisateur clique sur "Envoyer" sans être identifié
    if (commentForm) {
        commentForm.addEventListener('submit', (e) => {
            if (!hiddenName.value || !hiddenEmail.value) {
                e.preventDefault();
                Swal.fire({
                    icon: 'info',
                    title: 'Identification requise',
                    text: 'Veuillez vous identifier pour poster ce commentaire.',
                    confirmButtonText: 'S\'identifier',
                    confirmButtonColor: 'var(--c-primary)'
                }).then((res) => {
                    if (res.isConfirmed) promptForGuestInfo();
                });
            }
        });
    }
});