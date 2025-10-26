const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');

// Vérifie si les éléments existent avant d'ajouter l'écouteur
if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
        nav.classList.toggle('nav-visible');
        navToggle.classList.toggle('is-active');
    });
}