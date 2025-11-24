document.addEventListener('DOMContentLoaded', () => {
    const likeBtn = document.getElementById('like-btn');
    const likeCount = document.getElementById('like-count');
    const icon = likeBtn ? likeBtn.querySelector('i') : null;

    // Si le bouton n'existe pas ou est déjà désactivé (déjà liké ou admin), on arrête.
    if (!likeBtn || likeBtn.disabled) return;

    const articleId = likeBtn.getAttribute('data-id');

    likeBtn.addEventListener('click', async () => {

        // --- 1. VÉRIFICATION DU PROFIL (Sécurité Anti-Spam) ---
        // On vérifie si l'utilisateur est légitime pour liker

        // A. Est-ce que le serveur dit qu'on est connecté (Cookie invité ou admin) ?
        const serverProfile = likeBtn.getAttribute('data-has-profile') === 'true';

        // B. Est-ce que le navigateur a un pseudo en mémoire (LocalStorage) ?
        const localProfile = localStorage.getItem('blog_guest_username');

        if (!serverProfile && !localProfile) {
            Swal.fire({
                icon: 'info',
                title: 'Profil requis',
                text: 'Vous devez avoir un profil invité pour aimer cet article.',
                showCancelButton: true,
                confirmButtonText: 'Créer mon profil',
                cancelButtonText: 'Annuler',
                confirmButtonColor: 'var(--c-primary)'
            }).then((res) => {
                if (res.isConfirmed) {
                    // Redirige vers la page de création de profil
                    window.location.href = '/guest-profile';
                }
            });
            return; // STOP : On n'envoie pas le like
        }

        // --- 2. EFFET VISUEL IMMÉDIAT (Optimistic UI) ---
        likeBtn.classList.add('liked');
        likeBtn.disabled = true; // On bloque pour éviter le double-clic

        // Changement d'icône (Vide -> Plein)
        icon.classList.remove('far');
        icon.classList.add('fas');

        // Animation de "pop"
        icon.style.animation = 'heart-burst 0.4s ease';

        try {
            // --- 3. APPEL AU SERVEUR ---
            const response = await fetch(`/api/entree/${articleId}/like`, { method: 'POST' });

            if (response.ok) {
                const data = await response.json();
                if (data.likes !== undefined) {
                    // Mise à jour officielle du compteur
                    likeCount.textContent = data.likes;
                }
            } else {
                // Si le serveur refuse (ex: cookie déjà là, erreur BDD...)
                console.warn("Like refusé par le serveur");
                throw new Error("Refus serveur");
            }
        } catch (error) {
            console.error("Erreur Like:", error);

            // --- 4. ANNULATION EN CAS D'ERREUR ---
            // On remet l'état initial pour que l'utilisateur puisse réessayer
            likeBtn.classList.remove('liked');
            likeBtn.disabled = false;
            icon.classList.remove('fas');
            icon.classList.add('far');
            icon.style.animation = 'none';

            // Petit message discret (optionnel)
            const Toast = Swal.mixin({
                toast: true, position: 'top-end', showConfirmButton: false, timer: 3000
            });
            Toast.fire({ icon: 'error', title: 'Impossible d\'ajouter le like.' });
        }
    });
});