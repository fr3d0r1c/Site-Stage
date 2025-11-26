document.addEventListener('DOMContentLoaded', () => {
    // 1. Lancer la coloration syntaxique
    if (typeof hljs !== 'undefined') {
        hljs.highlightAll();
        addCopyButtons(); // Appel de notre nouvelle fonction
    }
});

// 2. Fonction pour ajouter les boutons "Copier"
function addCopyButtons() {
    // On cherche tous les blocs <pre> qui contiennent du <code>
    const codeBlocks = document.querySelectorAll('pre code');

    codeBlocks.forEach((codeBlock) => {
        const pre = codeBlock.parentNode; // Le parent <pre>

        // Création du bouton
        const button = document.createElement('button');
        button.className = 'copy-code-btn';
        button.innerHTML = '<i class="far fa-copy"></i> Copier'; // Icône FontAwesome
        button.ariaLabel = 'Copier le code';

        // Action au clic
        button.addEventListener('click', () => {
            // Récupérer le texte brut
            const codeText = codeBlock.innerText;

            // Copier dans le presse-papier
            navigator.clipboard.writeText(codeText).then(() => {
                // Feedback visuel (Succès)
                button.innerHTML = '<i class="fas fa-check"></i> Copié !';
                button.classList.add('copied');

                // Revenir à la normale après 2 secondes
                setTimeout(() => {
                    button.innerHTML = '<i class="far fa-copy"></i> Copier';
                    button.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Erreur copie :', err);
                button.innerHTML = 'Erreur';
            });
        });

        // Ajouter le bouton dans le bloc <pre>
        pre.appendChild(button);
    });
}