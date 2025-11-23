document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('open-comments-btn');
    const closeBtn = document.getElementById('close-comments-btn');
    const modalOverlay = document.getElementById('comments-modal-overlay');
    const body = document.body;

    // Fonction Ouvrir
    const openModal = () => {
        if (modalOverlay) {
            modalOverlay.classList.add('open'); // Utilise la classe pour l'affichage et l'anim
            body.style.overflow = 'hidden'; // Empêche le scroll de la page principale
        }
    };

    // Fonction Fermer
    const closeModal = () => {
        if (modalOverlay) {
            modalOverlay.classList.remove('open');
            body.style.overflow = ''; // Réactive le scroll
        }
    };

    // Événements
    if (openBtn) openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Fermer en cliquant sur le fond sombre
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
    }

    // Fermer avec Echap
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('open')) {
            closeModal();
        }
    });
});