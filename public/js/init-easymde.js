document.addEventListener('DOMContentLoaded', () => {
    const frenchEditorTextarea = document.getElementById('content-editor-fr');
    const previewDiv = document.getElementById('content-preview-fr');
    const titleInput = document.getElementById('title_fr');
    let easyMDE = null; // Variable to hold the EasyMDE instance

    if (frenchEditorTextarea) {
        easyMDE = new EasyMDE({
            element: frenchEditorTextarea,
            spellChecker: false,
            status: ["lines", "words"],
            // You can customize toolbar etc. here if needed
        });

        // --- Sync EasyMDE -> Preview & Title ---
        if (previewDiv || titleInput) {
            easyMDE.codemirror.on("change", () => {
                const markdownText = easyMDE.value();

                // Update Preview
                if (previewDiv) {
                    previewDiv.innerHTML = marked.parse(markdownText);
                }

                // Update Title from Editor's H1
                if (titleInput) {
                    const lines = markdownText.split('\n');
                    if (lines.length > 0 && lines[0].startsWith('# ')) {
                        const potentialTitle = lines[0].substring(2).trim();
                        // Only update if different to avoid potential cursor jumps
                        if (potentialTitle && titleInput.value !== potentialTitle) {
                             titleInput.value = potentialTitle;
                        }
                    }
                }
            });
            // Initial preview update on load
             if (previewDiv) {
                 previewDiv.innerHTML = marked.parse(easyMDE.value());
             }
        }

        // --- Sync Title -> EasyMDE ---
         if (titleInput) {
            let titleSyncTimeout;
            titleInput.addEventListener('input', () => {
                 // Debounce to avoid excessive updates
                 clearTimeout(titleSyncTimeout);
                 titleSyncTimeout = setTimeout(() => {
                    const newTitle = titleInput.value;
                    const currentContent = easyMDE.value();
                    const lines = currentContent.split('\n');
                    let titleUpdated = false;

                    if (lines.length > 0 && lines[0].startsWith('# ')) {
                        // Only update if the content is different from the new title
                        if (lines[0] !== '# ' + newTitle) {
                            lines[0] = '# ' + newTitle;
                            titleUpdated = true;
                        }
                    } else if (newTitle) { // Only add if title is not empty
                        lines.unshift('# ' + newTitle);
                        titleUpdated = true;
                    }
                    
                    // Update EasyMDE only if necessary
                    if (titleUpdated) {
                        const cursorPos = easyMDE.codemirror.getCursor(); // Get cursor position
                        easyMDE.value(lines.join('\n')); // Update EasyMDE content
                        easyMDE.codemirror.setCursor(cursorPos); // Try to restore cursor position
                    }
                 }, 300); // 300ms delay
            });
         }
    }

    // --- Make easyMDE instance globally accessible for uploader.js ---
    // Ensure this runs only if easyMDE was initialized
    if (easyMDE) {
        window.easyMDEInstance = easyMDE; 
    }
});