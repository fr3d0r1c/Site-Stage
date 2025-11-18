// public/js/main.js

document.addEventListener('DOMContentLoaded', () => {

    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.main-nav');

    // --- 1. Logique du Hamburger ---
    if (navToggle && nav) {
        navToggle.addEventListener('click', () => {
            nav.classList.toggle('nav-visible');
            navToggle.classList.toggle('is-active');

            // Met à jour l'attribut ARIA pour l'accessibilité
            const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
            navToggle.setAttribute('aria-expanded', !isExpanded);
        });
    }

    // --- 2. Logique de l'Accordéon Mobile (Corrigée) ---
    
    // Trouve tous les liens qui ouvrent un sous-menu
    const dropdownToggles = document.querySelectorAll('.main-nav .dropdown-toggle');
    
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', (event) => {
            
            // Vérifie si on est en mode "mobile" (si le hamburger est visible)
            const isMobile = navToggle.offsetParent !== null;

            if (isMobile) {
                // --- COMPORTEMENT MOBILE ---
                // Empêche le lien de fonctionner
                event.preventDefault(); 
                
                // Trouve le sous-menu (c'est l'élément <ul> juste après le lien <a>)
                const subMenu = toggle.nextElementSibling;
                
                // Ajoute/Enlève la classe pour l'animation CSS
                if (subMenu && subMenu.classList.contains('sous-menu')) {
                    subMenu.classList.toggle('sous-menu-ouvert');
                }
                
                // Ajoute/Enlève la classe sur le lien (pour faire tourner la flèche)
                toggle.classList.toggle('lien-ouvert');
                
            } else {
                // --- COMPORTEMENT ORDINATEUR (LA CORRECTION) ---
                
                // Si on est sur ordinateur, on veut que le :hover CSS fonctionne.
                // MAIS, si le lien principal est juste un "#" (comme "À Propos"),
                // on doit empêcher le clic de faire sauter la page.
                
                if (toggle.getAttribute('href') === '#') {
                    event.preventDefault();
                }
                // Si le href est un VRAI lien (comme "/journal" ou "/admin"),
                // le script ne fait rien et laisse le navigateur suivre le lien,
                // ce qui est le comportement attendu sur ordinateur.
            }
        });
    });

    // --- 3. Logique pour le Tri Automatique (Journal) ---
    const sortSelect = document.getElementById('sort-select');
    const sortForm = document.getElementById('sort-form');

    if (sortSelect && sortForm) {
        sortSelect.addEventListener('change', () => {
            sortForm.submit();
        });
    }
});