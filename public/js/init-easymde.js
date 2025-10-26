document.addEventListener('DOMContentLoaded', () => {
    // --- French Elements ---
    const frenchEditorTextarea = document.getElementById('content-editor-fr');
    const frenchPreviewDiv = document.getElementById('preview_fr'); // Corrected ID
    const frenchTitleInput = document.getElementById('title_fr');
    let easyMDE_fr = null;

    // --- Control Variables ---
    let isUpdatingFromEditor = false;
    let isUpdatingFromTitle = false;
    let contentDebounceTimer; // Debounce timer for translation trigger

    // --- Initialize French Editor ---
    if (frenchEditorTextarea) {
        easyMDE_fr = new EasyMDE({ element: frenchEditorTextarea, spellChecker: false, status: ["lines", "words"] });

        easyMDE_fr.codemirror.on("change", () => {
            if (isUpdatingFromTitle) return;
            isUpdatingFromEditor = true;

            const markdownText = easyMDE_fr.value();

            // Update FR Preview
            if (frenchPreviewDiv && typeof marked !== 'undefined') {
                frenchPreviewDiv.innerHTML = marked.parse(markdownText);
            }

            // Update FR Title from H1
            if (frenchTitleInput) {
                const lines = markdownText.split('\n');
                if (lines.length > 0 && lines[0].startsWith('# ')) {
                    const potentialTitle = lines[0].substring(2).trim();
                    if (potentialTitle && frenchTitleInput.value !== potentialTitle) {
                         frenchTitleInput.value = potentialTitle;
                         // Trigger title translation (from title input listener)
                         frenchTitleInput.dispatchEvent(new Event('input'));
                    }
                }
            }

             // --- Trigger Content Translation (with debounce) ---
             clearTimeout(contentDebounceTimer);
             if (markdownText.trim()) {
                 contentDebounceTimer = setTimeout(() => {
                     // Check if the global translateText function exists
                     if (typeof window.translateText === 'function') {
                         window.translateText(markdownText, 'en-GB', 'content'); // Pass 'content' type
                     }
                 }, 500); // 500ms delay
             } else {
                 // Clear EN preview if FR is empty
                 const previewEnDiv = document.getElementById('preview_en');
                 if (previewEnDiv) previewEnDiv.innerHTML = '';
                 const contentEnTextarea = document.getElementById('content_en');
                 if (contentEnTextarea) contentEnTextarea.value = ''; // Clear hidden EN textarea too
             }
             // --- End Translation Trigger ---

            isUpdatingFromEditor = false;
        });

        // Initial FR Preview
        if (frenchPreviewDiv && typeof marked !== 'undefined') {
             frenchPreviewDiv.innerHTML = marked.parse(easyMDE_fr.value());
        }
    }

    // --- Sync FR Title -> FR Editor ---
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
                    if (frenchPreviewDiv && typeof marked !== 'undefined') {
                       frenchPreviewDiv.innerHTML = marked.parse(easyMDE_fr.value());
                    }
                }
                 isUpdatingFromTitle = false;
             }, 300);
        });
     }

    // --- Make FR instance globally accessible ---
    if (easyMDE_fr) {
        window.easyMDEInstance = easyMDE_fr; // Keep using single instance name for uploader
        console.log("EasyMDE FR instance created.");
    }
});