document.addEventListener('DOMContentLoaded', () => {
    const likeBtn = document.getElementById('like-btn');
    const likeCount = document.getElementById('like-count');
    const icon = likeBtn ? likeBtn.querySelector('i') : null;

    if (!likeBtn || likeBtn.disabled) return;

    const articleId = likeBtn.getAttribute('data-id');

    likeBtn.addEventListener('click', async () => {

        // ============================================================
        // 1. VÉRIFICATION DU PROFIL (Le "Gatekeeper")
        // ============================================================
        const hasProfile = likeBtn.getAttribute('data-has-profile') === 'true';

        // SI L'UTILISATEUR N'A PAS DE COMPTE INVITÉ
        if (!hasProfile) {
            Swal.fire({
                icon: 'info',
                title: 'Compte requis',
                text: 'Vous devez avoir un profil invité pour aimer cet article.',
                showCancelButton: true,
                confirmButtonText: 'Créer mon profil',
                cancelButtonText: 'Annuler',
                confirmButtonColor: 'var(--c-primary)'
            }).then((res) => {
                if (res.isConfirmed) {
                    window.location.href = '/guest/login';
                }
            });
            return;
        }

        // ============================================================
        // 2. Si on arrive ici, c'est qu'il a un compte -> ON LIKE/UNLIKE
        // ============================================================

        // Gestion de l'état visuel (Optimistic UI)
        const isLiked = likeBtn.classList.contains('liked');

        // Toggle visuel immédiat
        if (isLiked) {
            // UNLIKE
            likeBtn.classList.remove('liked');
            icon.classList.replace('fas', 'far'); // Cœur vide
            icon.style.animation = 'none';
        } else {
            // LIKE
            likeBtn.classList.add('liked');
            icon.classList.replace('far', 'fas'); // Cœur plein
            icon.style.animation = 'heart-burst 0.4s ease';
        }

        likeBtn.disabled = true;

        try {
            const response = await fetch(`/api/entree/${articleId}/like`, { method: 'POST' });

            if (response.ok) {
                const data = await response.json();
                if (data.likes !== undefined) {
                    likeCount.textContent = data.likes;

                    // Synchronisation finale avec le serveur (au cas où)
                    if (data.liked) {
                        likeBtn.classList.add('liked');
                        icon.classList.replace('far', 'fas');
                    } else {
                        likeBtn.classList.remove('liked');
                        icon.classList.replace('fas', 'far');
                    }
                }
            } else {
                throw new Error('Erreur serveur');
            }
        } catch (error) {
            console.error("Erreur Like:", error);
            // Annulation en cas d'erreur (Rollback)
            likeBtn.classList.toggle('liked');
            if (isLiked) icon.classList.replace('far', 'fas');
            else icon.classList.replace('fas', 'far');
        } finally {
            likeBtn.disabled = false;
        }
    });
});