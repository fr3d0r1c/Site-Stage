document.addEventListener('DOMContentLoaded', () => {
    const likeBtn = document.getElementById('like-btn');
    const likeCount = document.getElementById('like-count');
    const icon = likeBtn ? likeBtn.querySelector('i') : null;

    // Si le bouton n'existe pas ou est déjà désactivé (déjà liké côté serveur), on arrête.
    if (!likeBtn || likeBtn.disabled) return;

    const articleId = likeBtn.getAttribute('data-id');

    likeBtn.addEventListener('click', async () => {

        if (!likeBtn.disabled && !localStorage.getItem('blog_guest_username')) {
            Swal.fire({
                icon: 'info',
                title: 'Profil requis',
                text: 'Vous devez créer un profil invité pour aimer cet article.',
                confirmButtonText: 'Créer mon profil',
                confirmButtonColor: 'var(--c-primary)'
            }).then((res) => {
                if (res.isConfirmed) {
                    // On scrolle vers le formulaire qui a le bouton "Créer profil"
                    document.getElementById('main-comment-form').scrollIntoView({behavior: 'smooth'});
                }
            });
            return;
        }
        // 1. Effet visuel immédiat (Optimistic UI)
        likeBtn.classList.add('liked');
        likeBtn.disabled = true; // On bloque pour éviter le double-clic
        icon.classList.remove('far');
        icon.classList.add('fas');
        icon.style.animation = 'heart-burst 0.4s ease';

        try {
            // 2. Appel au serveur
            const response = await fetch(`/api/entree/${articleId}/like`, { method: 'POST' });
            
            if (response.ok) {
                const data = await response.json();
                if (data.likes !== undefined) {
                    likeCount.textContent = data.likes;
                }
            } else {
                // SI ERREUR SERVEUR : On annule l'effet visuel !
                console.warn("Like refusé par le serveur");
                likeBtn.classList.remove('liked');
                likeBtn.disabled = false;
                icon.classList.remove('fas');
                icon.classList.add('far');
                icon.style.animation = 'none';
            }

        } catch (error) {
            console.error("Erreur réseau Like:", error);
            // En cas d'erreur réseau, on annule l'effet visuel pour que l'utilisateur puisse réessayer
            likeBtn.classList.remove('liked');
            likeBtn.disabled = false;
            icon.classList.remove('fas');
            icon.classList.add('far');
        }
    });
});