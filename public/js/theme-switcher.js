document.addEventListener('DOMContentLoaded', () => {
    const themeButtons = document.querySelectorAll('.theme-switcher button');
    const body = document.body;
    const currentTheme = localStorage.getItem('theme');

    // Fonction pour appliquer un thème
    function applyTheme(theme) {
        // Enlève toutes les classes de thème existantes
        body.classList.remove('theme-light', 'theme-dark', 'theme-sepia');

        if (theme === 'dark') {
            body.classList.add('theme-dark');
        } else if (theme === 'sepia') {
            body.classList.add('theme-sepia');
        } else if (theme === 'light') {
            // Pas besoin d'ajouter de classe pour le thème clair par défaut
        } else { // Thème "system"
            // On vérifie la préférence système
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                body.classList.add('theme-dark');
            }
            // Si le système est en mode clair, aucune classe n'est ajoutée
        }
    }

    // Appliquer le thème sauvegardé ou le thème système au chargement
    if (currentTheme) {
        applyTheme(currentTheme);
    } else {
        applyTheme('system'); // Par défaut, on suit le système
    }

    // Gérer les clics sur les boutons
    themeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const theme = button.getAttribute('data-theme');
            applyTheme(theme);
            // Sauvegarder le choix dans localStorage
            localStorage.setItem('theme', theme);
        });
    });

    // Écouter les changements de préférence système
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        const currentSetting = localStorage.getItem('theme');
        // Si l'utilisateur a choisi "Système", on met à jour en direct
        if (!currentSetting || currentSetting === 'system') {
            applyTheme('system');
        }
    });
});