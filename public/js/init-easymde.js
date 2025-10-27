document.addEventListener('DOMContentLoaded', () => {
    // --- Éléments Français ---
    const frenchEditorTextarea = document.getElementById('content-editor-fr');
    const frenchPreviewDiv = document.getElementById('preview_fr'); // Use the ID from the EJS
    const frenchTitleInput = document.getElementById('title_fr');
    let easyMDE_fr = null;

    // --- Variables de contrôle ---
    let isUpdatingFromEditor = false;
    let isUpdatingFromTitle = false;
    let contentDebounceTimer; // Debounce timer for translation trigger

    // --- Initialisation Editeur Français ---
    if (frenchEditorTextarea) {
        easyMDE_fr = new EasyMDE({
            element: frenchEditorTextarea,
            spellChecker: false,
            status: ["lines", "words"]
        });

        // --- Synchronisation EasyMDE -> Aperçu FR, Titre FR, et Déclenchement Traduction EN ---
        if (frenchPreviewDiv || frenchTitleInput) {
            easyMDE_fr.codemirror.on("change", () => {
                if (isUpdatingFromTitle) return; // Prevent loop if title changed editor
                isUpdatingFromEditor = true;

                const markdownText = easyMDE_fr.value();

                // 1. Mettre à jour l'aperçu FR
                if (frenchPreviewDiv && typeof marked !== 'undefined') {
                    frenchPreviewDiv.innerHTML = marked.parse(markdownText);
                }

                // 2. Mettre à jour le Titre FR depuis le H1 de l'éditeur
                if (frenchTitleInput) {
                    const lines = markdownText.split('\n');
                    if (lines.length > 0 && lines[0].startsWith('# ')) {
                        const potentialTitle = lines[0].substring(2).trim();
                        if (potentialTitle && frenchTitleInput.value !== potentialTitle) {
                            frenchTitleInput.value = potentialTitle;
                            // Trigger title translation (relies on listener in auto-translate-preview.js)
                            frenchTitleInput.dispatchEvent(new Event('input'));
                        }
                    }
                }

                // 3. Déclencher la traduction du CONTENU vers l'aperçu EN (avec délai)
                 clearTimeout(contentDebounceTimer);
                 if (markdownText.trim()) {
                     contentDebounceTimer = setTimeout(() => {
                         // Check if the global translateText function exists (defined in auto-translate-preview.js)
                         if (typeof window.translateText === 'function') {
                             window.translateText(markdownText, 'en-GB', 'content'); // Pass 'content' type
                         }
                     }, 500); // 500ms delay
                 } else {
                     // Clear EN preview and hidden textarea if FR is empty
                     const previewEnDiv = document.getElementById('preview_en');
                     if (previewEnDiv) previewEnDiv.innerHTML = '';
                     const contentEnTextarea = document.getElementById('content_en'); // Hidden EN
                     if (contentEnTextarea) contentEnTextarea.value = '';
                 }
                 // --- Fin Déclenchement Traduction Contenu ---

                isUpdatingFromEditor = false;
            });

            // Mise à jour initiale de l'aperçu FR au chargement
             if (frenchPreviewDiv && typeof marked !== 'undefined') {
                 frenchPreviewDiv.innerHTML = marked.parse(easyMDE_fr.value());
             }
        }

        // --- Synchronisation Titre FR -> Editeur FR ---
         if (frenchTitleInput && easyMDE_fr) {
            let titleSyncTimeout;
            frenchTitleInput.addEventListener('input', () => {
                 if (isUpdatingFromEditor) return; // Prevent loop if editor changed title
                 isUpdatingFromTitle = true;
                 clearTimeout(titleSyncTimeout);
                 titleSyncTimeout = setTimeout(() => {
                    const newTitle = frenchTitleInput.value;
                    const currentContent = easyMDE_fr.value();
                    const lines = currentContent.split('\n');
                    let titleUpdated = false;

                    if (lines.length > 0 && lines[0].startsWith('# ')) {
                        if (lines[0] !== '# ' + newTitle) { lines[0] = '# ' + newTitle; titleUpdated = true; }
                    } else if (newTitle) {
                        lines.unshift('# ' + newTitle); titleUpdated = true;
                    }

                    if (titleUpdated) {
                        const cursorPos = easyMDE_fr.codemirror.getCursor();
                        easyMDE_fr.value(lines.join('\n'));
                        easyMDE_fr.codemirror.setCursor(cursorPos);
                        // Force FR preview update since 'change' event was blocked
                        if (frenchPreviewDiv && typeof marked !== 'undefined') {
                           frenchPreviewDiv.innerHTML = marked.parse(easyMDE_fr.value());
                        }
                    }
                     isUpdatingFromTitle = false;
                 }, 300);
            });
         }
    }

    // --- Rendre l'instance FR accessible globalement pour uploader.js ---
    if (easyMDE_fr) {
        window.easyMDEInstance = easyMDE_fr; // Keep using the single instance name
        console.log("EasyMDE FR instance created.");
    }
});