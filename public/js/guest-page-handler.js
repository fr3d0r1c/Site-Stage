document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('guest-login-form');
    const loggedInSection = document.getElementById('guest-logged-in');
    const form = document.getElementById('guest-form');
    const logoutBtn = document.getElementById('guest-logout-btn');
    
    const displayName = document.getElementById('display-name');
    const displayEmail = document.getElementById('display-email');
    const inputName = document.getElementById('g-name');
    const inputEmail = document.getElementById('g-email');

    // --- FONCTION : Vérifier l'état ---
    function checkGuestStatus() {
        const savedName = localStorage.getItem('blog_guest_username');
        const savedEmail = localStorage.getItem('blog_guest_email');

        if (savedName && savedEmail) {
            // Connecté
            loginSection.style.display = 'none';
            loggedInSection.style.display = 'block';
            displayName.textContent = savedName;
            displayEmail.textContent = savedEmail;
        } else {
            // Pas connecté
            loginSection.style.display = 'block';
            loggedInSection.style.display = 'none';
            inputName.value = '';
            inputEmail.value = '';
        }
    }

    // --- ACTION : Connexion (Sauvegarde) ---
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = inputName.value.trim();
            const email = inputEmail.value.trim();

            if (name && email) {
                localStorage.setItem('blog_guest_username', name);
                localStorage.setItem('blog_guest_email', email);
                
                // Petit effet visuel
                Swal.fire({
                    icon: 'success',
                    title: 'Profil enregistré !',
                    text: 'Vous pouvez maintenant commenter librement.',
                    timer: 1500,
                    showConfirmButton: false
                });
                
                checkGuestStatus();
            }
        });
    }

    // --- ACTION : Déconnexion (Suppression) ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            Swal.fire({
                title: 'Se déconnecter ?',
                text: "Vos informations seront effacées de ce navigateur.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'Oui, effacer',
                cancelButtonText: 'Annuler'
            }).then((result) => {
                if (result.isConfirmed) {
                    localStorage.removeItem('blog_guest_username');
                    localStorage.removeItem('blog_guest_email');
                    
                    Swal.fire('Déconnecté', 'Vos infos ont été supprimées.', 'success');
                    checkGuestStatus();
                }
            });
        });
    }

    // Initialisation au chargement
    checkGuestStatus();
});