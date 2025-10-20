// On s'assure que le script s'exécute quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    // On sélectionne les trois éléments dont nous avons besoin
    const editor = document.getElementById('content-editor');
    const preview = document.getElementById('content-preview');
    const titleInput = document.getElementById('title');

    // S'assure que les éléments existent sur la page avant de continuer
    if (!editor || !preview || !titleInput) return;

    // Variable "verrou" pour éviter les boucles de mise à jour infinies
    let isUpdating = false;

    // Fonction qui met à jour le titre ET l'aperçu à partir de l'éditeur
    function updateFromEditor() {
        if (isUpdating) return;
        isUpdating = true;

        const markdownText = editor.value;

        // Logique d'auto-remplissage du titre
        const lines = markdownText.split('\n');
        if (lines.length > 0 && lines[0].startsWith('# ')) {
            const potentialTitle = lines[0].substring(2).trim();
            titleInput.value = potentialTitle;
        }

        // Logique de l'aperçu
        const htmlText = marked.parse(markdownText);
        preview.innerHTML = htmlText;
        
        isUpdating = false;
    }

    // Fonction qui met à jour l'éditeur à partir du champ titre
    function updateFromTitle() {
        if (isUpdating) return;
        isUpdating = true;

        const newTitle = titleInput.value;
        const lines = editor.value.split('\n');

        if (lines.length > 0 && lines[0].startsWith('# ')) {
            lines[0] = '# ' + newTitle;
        } else {
            lines.unshift('# ' + newTitle);
        }
        
        editor.value = lines.join('\n');
        
        const htmlText = marked.parse(editor.value);
        preview.innerHTML = htmlText;
        
        isUpdating = false;
    }

    // On attache les écouteurs d'événements
    editor.addEventListener('input', updateFromEditor);
    titleInput.addEventListener('input', updateFromTitle);

    // On exécute la fonction une première fois au chargement
    updateFromEditor();
});