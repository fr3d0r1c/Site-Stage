document.addEventListener('DOMContentLoaded', () => {
    const frenchEditorTextarea = document.getElementById('content-editor-fr');
    const previewDiv = document.getElementById('content-preview-fr');
    const titleInput = document.getElementById('title_fr');
    let easyMDE = null; // Variable pour contenir l'instance EasyMDE

    // Continuer seulement si la textarea principale existe
    if (frenchEditorTextarea) {
        easyMDE = new EasyMDE({
            element: frenchEditorTextarea,
            spellChecker: false, // Désactive le correcteur orthographique
            status: ["lines", "words"], // Affiche le nombre de lignes/mots
        });

        // --- Synchronisation EasyMDE -> Aperçu & Titre ---
        if (previewDiv || titleInput) {
            easyMDE.codemirror.on("change", () => {
                const markdownText = easyMDE.value();

                // Mettre à jour l'aperçu
                if (previewDiv) {
                    previewDiv.innerHTML = marked.parse(markdownText);
                }

                // Mettre à jour le champ Titre depuis le H1 de l'éditeur
                if (titleInput) {
                    const lines = markdownText.split('\n');
                    if (lines.length > 0 && lines[0].startsWith('# ')) {
                        const potentialTitle = lines[0].substring(2).trim();
                        // Mettre à jour seulement si différent pour éviter des problèmes de curseur
                        if (potentialTitle && titleInput.value !== potentialTitle) {
                             titleInput.value = potentialTitle;
                        }
                    }
                }
            });

            // Mise à jour initiale de l'aperçu au chargement
             if (previewDiv) {
                 previewDiv.innerHTML = marked.parse(easyMDE.value());
             }
        }

        // --- Synchronisation Titre -> EasyMDE ---
         if (titleInput) {
            let titleSyncTimeout;
            titleInput.addEventListener('input', () => {
                 // Utilise un délai pour éviter les mises à jour trop fréquentes
                 clearTimeout(titleSyncTimeout);
                 titleSyncTimeout = setTimeout(() => {
                    const newTitle = titleInput.value;
                    if (!easyMDE) return; // Sécurité
                    const currentContent = easyMDE.value();
                    const lines = currentContent.split('\n');
                    let titleUpdated = false;

                    // Si la première ligne est déjà un H1, la remplacer si différente
                    if (lines.length > 0 && lines[0].startsWith('# ')) {
                        if (lines[0] !== '# ' + newTitle) {
                            lines[0] = '# ' + newTitle;
                            titleUpdated = true;
                        }
                    // Sinon, ajouter le titre au début (si le titre n'est pas vide)
                    } else if (newTitle) {
                        lines.unshift('# ' + newTitle);
                        titleUpdated = true;
                    }

                    // Mettre à jour EasyMDE seulement si nécessaire
                    if (titleUpdated) {
                        const cursorPos = easyMDE.codemirror.getCursor(); // Sauve la position du curseur
                        easyMDE.value(lines.join('\n')); // Met à jour le contenu
                        easyMDE.codemirror.setCursor(cursorPos); // Essaie de restaurer le curseur
                    }
                 }, 300); // Délai de 300ms
            });
         }
    }

    // --- Rendre l'instance EasyMDE accessible globalement pour uploader.js ---
    if (easyMDE) {
        window.easyMDEInstance = easyMDE;
    }
});