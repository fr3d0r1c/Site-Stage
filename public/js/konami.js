document.addEventListener('DOMContentLoaded', () => {

    // Le fameux code Konami
    // (Haut, Haut, Bas, Bas, Gauche, Droite, Gauche, Droite, B, A)
    const konamiCode = [
        'ArrowUp', 'ArrowUp',
        'ArrowDown', 'ArrowDown',
        'ArrowLeft', 'ArrowRight',
        'ArrowLeft', 'ArrowRight',
        'b', 'a'
    ];

    let konamiIndex = 0; // Où on en est dans la séquence

    // Écoute l'événement "keydown" (touche pressée) sur toute la page
    document.addEventListener('keydown', (event) => {
        // Récupère le nom de la touche pressée
        const key = event.key;

        // Compare la touche pressée avec la touche attendue dans la séquence
        if (key === konamiCode[konamiIndex]) {
            // C'est la bonne touche ! On avance dans la séquence.
            konamiIndex++;

            // Si on est arrivé au bout de la séquence...
            if (konamiIndex === konamiCode.length) {
                konamiIndex = 0; // Réinitialise le compteur

                // La page de connexion est cachée : le serveur ne l'ouvre (15 min) que s'il reçoit la bonne séquence.
                fetch('/api/konami', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sequence: konamiCode })
                })
                    .then((res) => (res.ok ? res.json() : null))
                    .then((data) => {
                        if (data && data.ok) window.location.href = data.redirect;
                    })
                    .catch(() => { /* hors ligne ou erreur : on ne fait rien */ });
            }
        } else {
            // Mauvaise touche. On réinitialise la séquence.
            // (Petite astuce pour ne pas bloquer si on re-tape la première touche)
            if (key === konamiCode[0]) {
                konamiIndex = 1;
            } else {
                konamiIndex = 0;
            }
        }
    });
});
