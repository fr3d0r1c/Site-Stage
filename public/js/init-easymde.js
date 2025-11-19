document.addEventListener('DOMContentLoaded', () => {
    // --- Éléments Français ---
    const frenchEditorTextarea = document.getElementById('content-editor-fr');
    const frenchPreviewDiv = document.getElementById('preview_fr'); // ID correct
    const frenchTitleInput = document.getElementById('title_fr');
    let easyMDE_fr = null;

    // --- Variables de contrôle ---
    let isUpdatingFromEditor = false;
    let isUpdatingFromTitle = false;
    let contentDebounceTimer; // Timer pour la traduction

    // --- Initialisation Editeur Français ---
    if (frenchEditorTextarea) {
        easyMDE_fr = new EasyMDE({
            element: frenchEditorTextarea,
            spellChecker: false,
            status: ["lines", "words"],
            // Configuration de la barre d'outils avec bouton Image personnalisé
            toolbar: [
                "bold", "italic", "heading", "|",
                "quote", "unordered-list", "ordered-list", "|",
                "link",
                {
                    name: "image",
                    action: function customImage(editor) {
                        // Déclenche le clic sur l'input de fichier caché
                        const fileInput = document.getElementById('image-upload-input');
                        if (fileInput) {
                            fileInput.click();
                        }
                    },
                    className: "fa fa-image",
                    title: "Insérer Image (Upload)",
                },
                 "|", "preview", "side-by-side", "fullscreen", "|", "guide"
            ]
        });

        // --- Événement : Changement dans l'éditeur ---
        easyMDE_fr.codemirror.on("change", () => {
            if (isUpdatingFromTitle) return; // Évite la boucle infinie
            isUpdatingFromEditor = true;

            const markdownText = easyMDE_fr.value();

            // 1. Mettre à jour l'aperçu FR (avec nettoyage du titre H1)
            if (frenchPreviewDiv && typeof marked !== 'undefined') {
                try {
                    // Enlève la première ligne si c'est un titre (# ...) pour l'affichage
                    const cleanMarkdown = markdownText.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                    frenchPreviewDiv.innerHTML = marked.parse(cleanMarkdown);
                } catch (e) {
                     console.error("Error parsing French Markdown:", e);
                     frenchPreviewDiv.innerHTML = "<p style='color:red;'>Erreur rendu Markdown FR.</p>"
                }
            }

            // 2. Mettre à jour le champ "Titre (FR)" depuis le H1 du Markdown
            if (frenchTitleInput) {
                const lines = markdownText.split('\n');
                if (lines.length > 0 && lines[0].startsWith('# ')) {
                    const potentialTitle = lines[0].substring(2).trim();
                    if (potentialTitle && frenchTitleInput.value !== potentialTitle) {
                        frenchTitleInput.value = potentialTitle;
                        // Déclenche l'événement 'input' pour lancer la traduction du titre
                        frenchTitleInput.dispatchEvent(new Event('input'));
                    }
                }
            }

            // 3. Déclencher la traduction du CONTENU vers l'anglais (avec délai)
             clearTimeout(contentDebounceTimer);
             if (markdownText.trim()) {
                 contentDebounceTimer = setTimeout(() => {
                     // Appelle la fonction globale définie dans auto-translate-preview.js
                     if (typeof window.translateText === 'function') {
                         window.translateText(markdownText, 'en-GB', 'content');
                     }
                 }, 500); // Délai de 500ms
             } else {
                 // Nettoyage si vide
                 const previewEnDiv = document.getElementById('preview_en');
                 if (previewEnDiv) previewEnDiv.innerHTML = '';
                 const contentEnTextarea = document.getElementById('content_en');
                 if (contentEnTextarea) contentEnTextarea.value = '';
             }

            isUpdatingFromEditor = false;
        });

        // --- Initialisation de l'aperçu FR au chargement ---
         if (frenchPreviewDiv && typeof marked !== 'undefined') {
             try {
                 const initialText = easyMDE_fr.value();
                 const cleanInitial = initialText.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                 frenchPreviewDiv.innerHTML = marked.parse(cleanInitial);
             } catch (e) {
                  console.error("Error parsing initial French Markdown:", e);
             }
         }
    }

    // --- Synchronisation inverse : Titre FR -> Editeur FR ---
     if (frenchTitleInput && easyMDE_fr) {
        let titleSyncTimeout;
        frenchTitleInput.addEventListener('input', () => {
             if (isUpdatingFromEditor) return; // Évite la boucle infinie
             isUpdatingFromTitle = true;
             
             clearTimeout(titleSyncTimeout);
             titleSyncTimeout = setTimeout(() => {
                const newTitle = frenchTitleInput.value;
                const currentContent = easyMDE_fr.value();
                const lines = currentContent.split('\n');
                let titleUpdated = false;

                // Met à jour ou ajoute le titre H1 dans le Markdown
                if (lines.length > 0 && lines[0].startsWith('# ')) {
                    if (lines[0] !== '# ' + newTitle) { 
                        lines[0] = '# ' + newTitle; 
                        titleUpdated = true; 
                    }
                } else if (newTitle) {
                    lines.unshift('# ' + newTitle); 
                    titleUpdated = true;
                }

                if (titleUpdated) {
                    const cursorPos = easyMDE_fr.codemirror.getCursor();
                    easyMDE_fr.value(lines.join('\n'));
                    easyMDE_fr.codemirror.setCursor(cursorPos);
                    // Force la mise à jour de l'aperçu FR car l'événement 'change' est bloqué par le flag
                    if (frenchPreviewDiv && typeof marked !== 'undefined') {
                       try {
                           // On utilise easyMDE_fr.value() qui contient le nouveau titre,
                           // mais le replace() va l'enlever de l'aperçu, ce qui est le but.
                           const cleanText = easyMDE_fr.value().replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                           frenchPreviewDiv.innerHTML = marked.parse(cleanText);
                       } catch(e){}
                    }
                }
                 isUpdatingFromTitle = false;
             }, 300);
        });
     }

    // --- Rendre l'instance accessible globalement (pour uploader.js et form-validation.js) ---
    if (easyMDE_fr) {
        window.easyMDEInstance = easyMDE_fr;
        // Émet un événement pour signaler que l'éditeur est prêt (pour la validation)
        document.dispatchEvent(new CustomEvent('easyMDEReady', { detail: { instance: easyMDE_fr } }));
    }
});