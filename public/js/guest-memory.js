document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('guest-login-btn');
    const editBtn = document.getElementById('guest-edit-btn');
    const commentForm = document.querySelector('.comment-form form');
    const hiddenName = document.getElementById('author_name');

    // --- 1. MENU PRINCIPAL : CRÉER OU RÉCUPÉRER ---
    const promptForGuestInfo = async () => {
        const result = await Swal.fire({
            title: 'Identification Invité',
            text: 'Avez-vous déjà créé un profil sur ce site ?',
            icon: 'question',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: 'Non, créer un profil',
            denyButtonText: 'Oui, récupérer mon compte',
            cancelButtonText: 'Annuler',
            confirmButtonColor: 'var(--c-primary)', // Couleur thème
            denyButtonColor: '#28a745' // Vert pour "Oui"
        });

        if (result.isConfirmed) {
            // Choix : Créer
            handleCreation();
        } else if (result.isDenied) {
            // Choix : Récupérer
            handleRecovery();
        }
    };

    // --- 2. FORMULAIRE DE CRÉATION ---
    const handleCreation = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Nouveau Profil',
            html:
                `<p style="font-size:0.9rem; color:#666; margin-bottom:1rem;">Créez votre identité pour commenter.</p>` +
                `<input id="swal-name" class="swal2-input" placeholder="Pseudo public">` +
                `<input id="swal-email" class="swal2-input" placeholder="Email (privé)">` +
                `<label style="display:block; margin-top:10px; font-weight:bold; font-size:0.9rem;">Avatar :</label>` +
                `<select id="swal-style" class="swal2-input" style="margin-top:5px;">
                    <option value="bottts">🤖 Robots</option>
                    <option value="avataaars">🧑 Humains</option>
                    <option value="monsterrr">👾 Monstres</option>
                    <option value="identicon">🔷 Géométrique</option>
                    <option value="initials">🅰️ Initiales</option>
                 </select>`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Créer & Connecter',
            preConfirm: () => {
                const name = document.getElementById('swal-name').value;
                const email = document.getElementById('swal-email').value;
                const style = document.getElementById('swal-style').value;
                if (!name || !email) return Swal.showValidationMessage('Tous les champs sont requis');
                return { name, email, avatar_style: style };
            }
        });

        if (formValues) {
            // Envoi au serveur
            sendData('/guest/login', formValues, 'Profil créé avec succès !');
        }
    };

    // --- 3. FORMULAIRE DE RÉCUPÉRATION ---
    const handleRecovery = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Connexion',
            html:
                `<p style="font-size:0.9rem; color:#666; margin-bottom:1rem;">Entrez vos infos pour retrouver votre historique.</p>` +
                `<input id="swal-name" class="swal2-input" placeholder="Votre Pseudo enregistré">` +
                `<input id="swal-email" class="swal2-input" placeholder="Votre Email enregistré">`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Récupérer',
            preConfirm: () => {
                const name = document.getElementById('swal-name').value;
                const email = document.getElementById('swal-email').value;
                if (!name || !email) return Swal.showValidationMessage('Pseudo et Email requis');
                return { name, email };
            }
        });

        if (formValues) {
            // Envoi au serveur
            sendData('/guest/recover', formValues, 'Profil retrouvé !');
        }
    };

    // --- 4. FONCTION D'ENVOI AU SERVEUR ---
    const sendData = async (url, data, successMessage) => {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json' // IMPORTANT : On demande du JSON au serveur
                },
                body: JSON.stringify(data)
            });

            // On lit la réponse JSON du serveur
            const result = await response.json();

            if (response.ok && result.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Succès !',
                    text: successMessage,
                    timer: 1500,
                    showConfirmButton: false
                }).then(() => {
                    window.location.reload(); // On recharge pour afficher le profil connecté
                });
            } else {
                // Erreur envoyée par le serveur (ex: profil non trouvé)
                Swal.fire('Erreur', result.error || 'Une erreur est survenue.', 'error');
            }
        } catch (e) {
            console.error(e);
            Swal.fire('Erreur', 'Problème de connexion au serveur.', 'error');
        }
    };

    // --- 5. ÉVÉNEMENTS ---
    if (loginBtn) loginBtn.addEventListener('click', promptForGuestInfo);
    if (editBtn) editBtn.addEventListener('click', promptForGuestInfo); // Le crayon rouvre le menu choix

    // Interception envoi formulaire commentaire
    if (commentForm) {
        commentForm.addEventListener('submit', (e) => {
            if (!hiddenName || !hiddenName.value) {
                e.preventDefault();
                Swal.fire({
                    icon: 'info',
                    title: 'Identification requise',
                    text: 'Veuillez vous identifier pour commenter.',
                    confirmButtonText: 'S\'identifier',
                    confirmButtonColor: 'var(--c-primary)'
                }).then((res) => {
                    if (res.isConfirmed) promptForGuestInfo();
                });
            }
        });
    }
});