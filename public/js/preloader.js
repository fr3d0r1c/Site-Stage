// Attend que le HTML et le CSS de base soient chargés
document.addEventListener('DOMContentLoaded', () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
        // Ajoute la classe 'hidden' pour déclencher la transition CSS
        preloader.classList.add('hidden');
    }
});