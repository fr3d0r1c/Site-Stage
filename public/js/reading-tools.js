document.addEventListener('DOMContentLoaded', () => {

    // --- 1. BARRE DE PROGRESSION ---
    const progressBar = document.getElementById('reading-progress-bar');

    // --- 2. BOUTON BACK TO TOP ---
    const backToTopBtn = document.getElementById('back-to-top');

    window.addEventListener('scroll', () => {
        // Calculs de scroll
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;

        // A. Mise à jour Barre
        if (progressBar && height > 0) {
            const scrolled = (winScroll / height) * 100;
            progressBar.style.width = scrolled + "%";
        }

        // B. Affichage Bouton (si on descend de plus de 300px)
        if (backToTopBtn) {
            if (winScroll > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        }
    });

    // Action au clic sur le bouton
    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
});