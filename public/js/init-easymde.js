document.addEventListener('DOMContentLoaded', () => {
    // --- Éléments Français ---
    const frenchEditorTextarea = document.getElementById('content-editor-fr');
    const frenchPreviewDiv = document.getElementById('content-preview-fr');
    const frenchTitleInput = document.getElementById('title_fr');
    let easyMDE_fr = null;

    // --- Éléments Anglais ---
    const englishEditorTextarea = document.getElementById('content-editor-en');
    const englishPreviewDiv = document.getElementById('content-preview-en');
    const englishTitleInput = document.getElementById('title_en');
    let easyMDE_en = null;

    // --- Variables de contrôle ---
    let isUpdatingFromEditor = false; // Verrou pour éviter boucle Editeur -> Titre -> Editeur
    let isUpdatingFromTitle = false;  // Verrou pour éviter boucle Titre -> Editeur -> Titre

    // --- Initialisation Editeur Français ---
    if (frenchEditorTextarea) {
        easyMDE_fr = new EasyMDE({ element: frenchEditorTextarea, spellChecker: false, status: ["lines", "words"] });

        easyMDE_fr.codemirror.on("change", () => {
            if (isUpdatingFromTitle) return; // Si c'est le titre qui a déclenché, on ignore
            isUpdatingFromEditor = true;

            const markdownText = easyMDE_fr.value();
            if (frenchPreviewDiv && typeof marked !== 'undefined') {
                frenchPreviewDiv.innerHTML = marked.parse(markdownText);
            }
            if (frenchTitleInput) {
                const lines = markdownText.split('\n');
                if (lines.length > 0 && lines[0].startsWith('# ')) {
                    const potentialTitle = lines[0].substring(2).trim();
                    if (potentialTitle && frenchTitleInput.value !== potentialTitle) {
                         frenchTitleInput.value = potentialTitle;
                    }
                }
            }
            isUpdatingFromEditor = false;
        });
        if (frenchPreviewDiv && typeof marked !== 'undefined') {
             frenchPreviewDiv.innerHTML = marked.parse(easyMDE_fr.value());
        }
    }

    // --- Synchronisation Titre FR -> Editeur FR ---
     if (frenchTitleInput && easyMDE_fr) {
        let titleSyncTimeout;
        frenchTitleInput.addEventListener('input', () => {
             if (isUpdatingFromEditor) return; // Si c'est l'éditeur qui a déclenché, on ignore
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
                    // On force la mise à jour de l'aperçu car l'event 'change' a été bloqué
                    if (frenchPreviewDiv && typeof marked !== 'undefined') {
                       frenchPreviewDiv.innerHTML = marked.parse(easyMDE_fr.value());
                    }
                }
                 isUpdatingFromTitle = false;
             }, 300);
        });
     }

    // --- Initialisation Editeur Anglais ---
    if (englishEditorTextarea) {
        easyMDE_en = new EasyMDE({ element: englishEditorTextarea, spellChecker: false, status: ["lines", "words"] });

        easyMDE_en.codemirror.on("change", () => {
             if (isUpdatingFromTitle) return;
             isUpdatingFromEditor = true;

             const markdownText = easyMDE_en.value();
             if (englishPreviewDiv && typeof marked !== 'undefined') {
                 englishPreviewDiv.innerHTML = marked.parse(markdownText);
             }
             if (englishTitleInput) {
                 const lines = markdownText.split('\n');
                 if (lines.length > 0 && lines[0].startsWith('# ')) {
                     const potentialTitle = lines[0].substring(2).trim();
                     if (potentialTitle && englishTitleInput.value !== potentialTitle) {
                          englishTitleInput.value = potentialTitle;
                     }
                 }
             }
             isUpdatingFromEditor = false;
        });
         if (englishPreviewDiv && typeof marked !== 'undefined') {
              englishPreviewDiv.innerHTML = marked.parse(easyMDE_en.value());
         }
    }

    // --- Synchronisation Titre EN -> Editeur EN ---
     if (englishTitleInput && easyMDE_en) {
        let titleSyncTimeoutEn;
         englishTitleInput.addEventListener('input', () => {
             if (isUpdatingFromEditor) return;
             isUpdatingFromTitle = true;

             clearTimeout(titleSyncTimeoutEn);
             titleSyncTimeoutEn = setTimeout(() => {
                const newTitle = englishTitleInput.value;
                const currentContent = easyMDE_en.value();
                const lines = currentContent.split('\n');
                let titleUpdated = false;

                if (lines.length > 0 && lines[0].startsWith('# ')) {
                   if (lines[0] !== '# ' + newTitle) { lines[0] = '# ' + newTitle; titleUpdated = true; }
                } else if (newTitle) {
                    lines.unshift('# ' + newTitle); titleUpdated = true;
                }

                if (titleUpdated) {
                    const cursorPos = easyMDE_en.codemirror.getCursor();
                    easyMDE_en.value(lines.join('\n'));
                    easyMDE_en.codemirror.setCursor(cursorPos);
                    // On force la mise à jour de l'aperçu EN
                    if (englishPreviewDiv && typeof marked !== 'undefined') {
                       englishPreviewDiv.innerHTML = marked.parse(easyMDE_en.value());
                    }
                }
                 isUpdatingFromTitle = false;
             }, 300);
         });
     }

    // --- Rendre les instances accessibles globalement ---
    window.easyMDEInstances = {
        fr: easyMDE_fr,
        en: easyMDE_en
    };
});