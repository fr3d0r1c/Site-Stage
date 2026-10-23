// Applique le thème choisi AVANT le premier affichage de la page.
// Ce script est chargé tout en haut du <body> (bloquant, très court) : sans lui, le thème n'était appliqué
// qu'à la fin du chargement et les visiteurs en mode sombre voyaient un éclair de page claire à chaque page.
// theme-switcher.js reprend la main ensuite (boutons, changement du thème du système).
(function () {
    try {
        var theme = localStorage.getItem('theme') || 'system';
        var body = document.body;
        if (theme === 'dark') {
            body.classList.add('theme-dark');
        } else if (theme === 'sepia') {
            body.classList.add('theme-sepia');
        } else if (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            body.classList.add('theme-dark');
        }
    } catch (e) { /* stockage bloqué : on garde le thème par défaut */ }
})();
