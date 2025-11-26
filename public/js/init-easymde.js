document.addEventListener('DOMContentLoaded', () => {
    const frenchEditorTextarea = document.getElementById('content-editor-fr');
    const frenchPreviewDiv = document.getElementById('preview_fr'); 
    const frenchTitleInput = document.getElementById('title_fr');
    let easyMDE_fr = null;
    let isUpdatingFromEditor = false;
    let isUpdatingFromTitle = false;
    let contentDebounceTimer;

    // --- Initialisation Editeur Français ---
    if (frenchEditorTextarea) {
        
        // Vérification de sécurité
        if (typeof marked === 'undefined') {
            console.error("ERREUR : La librairie 'marked' n'est pas chargée !");
            if (frenchPreviewDiv) frenchPreviewDiv.innerHTML = "<p style='color:red;'>Erreur : Librairie 'marked' manquante.</p>";
        }

        easyMDE_fr = new EasyMDE({
            element: frenchEditorTextarea,
            autoDownloadFontAwesome: false, 
            spellChecker: false,
            status: ["lines", "words"],
            toolbar: [
                "bold", "italic", "heading", 
                "|", 
                "quote", "unordered-list", "ordered-list", 
                "|", 
                
                // --- NOUVEAU BOUTON CODE BLOCK {} ---
                {
                    name: "code-block",
                    action: function(editor) {
                        const cm = editor.codemirror;
                        const selection = cm.getSelection();
                        // Si du texte est sélectionné, on l'entoure. Sinon, texte par défaut.
                        const text = selection ? selection : "Votre code ici";
                        
                        // Insertion des ```
                        cm.replaceSelection("```\n" + text + "\n```\n");
                        
                        // Remet le focus sur l'éditeur
                        cm.focus();
                    },
                    className: "fa fa-code", // Icône < >
                    title: "Insérer un bloc de code",
                },
                // ------------------------------------

                "link",
                {
                    name: "image",
                    action: function customImage(editor) {
                        const fileInput = document.getElementById('image-upload-input');
                        if (fileInput) fileInput.click();
                    },
                    className: "fa fa-image",
                    title: "Insérer Image",
                },
                 "|", "preview", "side-by-side", "fullscreen", "|", "guide"
            ]
        });

        // --- Événement : Changement dans l'éditeur ---
        easyMDE_fr.codemirror.on("change", () => {
            if (isUpdatingFromTitle) return;
            isUpdatingFromEditor = true;

            const markdownText = easyMDE_fr.value();

            // 1. Mise à jour Aperçu FR
            if (frenchPreviewDiv && typeof marked !== 'undefined') {
                try {
                    const cleanMarkdown = markdownText.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                    frenchPreviewDiv.innerHTML = marked.parse(cleanMarkdown);
                    
                    // Coloration syntaxique en temps réel
                    if (typeof hljs !== 'undefined') {
                        frenchPreviewDiv.querySelectorAll('pre code').forEach((block) => {
                            hljs.highlightElement(block);
                        });
                        // Ajout des boutons "Copier" dynamiquement
                        if (typeof addCopyButtons === 'function') addCopyButtons();
                    }
                } catch (e) {
                     console.error("Erreur parsing Markdown FR:", e);
                }
            }

            // 2. Mise à jour du Titre FR
            if (frenchTitleInput) {
                const lines = markdownText.split('\n');
                if (lines.length > 0 && lines[0].startsWith('# ')) {
                    const potentialTitle = lines[0].substring(2).trim();
                    if (potentialTitle && frenchTitleInput.value !== potentialTitle) {
                        frenchTitleInput.value = potentialTitle;
                        frenchTitleInput.dispatchEvent(new Event('input'));
                    }
                }
            }

            // 3. Traduction EN (Debounce)
             clearTimeout(contentDebounceTimer);
             if (markdownText.trim()) {
                 contentDebounceTimer = setTimeout(() => {
                     if (typeof window.translateText === 'function') {
                         window.translateText(markdownText, 'en-GB', 'content');
                     }
                 }, 500);
             } else {
                 const previewEnDiv = document.getElementById('preview_en');
                 if (previewEnDiv) previewEnDiv.innerHTML = '';
                 const contentEnTextarea = document.getElementById('content_en');
                 if (contentEnTextarea) contentEnTextarea.value = '';
             }

            isUpdatingFromEditor = false;
        });

        // --- Initialisation au chargement ---
         if (frenchPreviewDiv && typeof marked !== 'undefined') {
             try {
                 const initial = easyMDE_fr.value();
                 const cleanInitial = initial.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                 frenchPreviewDiv.innerHTML = marked.parse(cleanInitial);
                 if (typeof hljs !== 'undefined') {
                     hljs.highlightAll();
                     if (typeof addCopyButtons === 'function') addCopyButtons();
                 }
             } catch (e) {}
         }
    }

    // --- Synchro Titre -> Editeur ---
     if (frenchTitleInput && easyMDE_fr) {
        let titleSyncTimeout;
        frenchTitleInput.addEventListener('input', () => {
             if (isUpdatingFromEditor) return;
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
                }
                 isUpdatingFromTitle = false;
             }, 300);
        });
     }

    if (easyMDE_fr) {
        window.easyMDEInstance = easyMDE_fr;
        document.dispatchEvent(new CustomEvent('easyMDEReady', { detail: { instance: easyMDE_fr } }));
    }
});