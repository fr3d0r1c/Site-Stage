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
                console.log('KONAMI CODE ACTIVATED!');
                // Redirige vers la page de connexion
                window.location.href = '/connexion';
                // Réinitialise le compteur
                konamiIndex = 0;
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