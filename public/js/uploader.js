document.addEventListener('DOMContentLoaded', () => {
    // Buttons and shared file input
    const uploadBtnFr = document.getElementById('upload-image-btn');
    const urlBtnFr = document.getElementById('add-url-image-btn');
    const uploadBtnEn = document.getElementById('upload-image-btn-en');
    const urlBtnEn = document.getElementById('add-url-image-btn-en');
    const fileInput = document.getElementById('image-upload-input'); // Keep one hidden input
    let targetEditorInstance = null; // To know which editor to update

    // Wait for EasyMDE instances
    setTimeout(() => {
        const easyMDE_fr = window.easyMDEInstances ? window.easyMDEInstances.fr : null;
        const easyMDE_en = window.easyMDEInstances ? window.easyMDEInstances.en : null;

        if (!easyMDE_fr && !easyMDE_en) {
            console.warn("No EasyMDE instances found for uploader.");
            return;
        }

        function insertTextAtCursor(easyMDEInstance, text) {
            if (!easyMDEInstance) return;
            const cm = easyMDEInstance.codemirror;
            const doc = cm.getDoc();
            const cursor = doc.getCursor();
            doc.replaceRange(text, cursor);
        }

        // --- Event Listeners ---
        // Set target editor when a button is clicked

        if (uploadBtnFr) {
            uploadBtnFr.addEventListener('click', () => {
                targetEditorInstance = easyMDE_fr;
                fileInput.click();
            });
        }
        if (urlBtnFr) {
             urlBtnFr.addEventListener('click', () => {
                 targetEditorInstance = easyMDE_fr;
                 addImageByUrl();
             });
        }
         if (uploadBtnEn) {
            uploadBtnEn.addEventListener('click', () => {
                targetEditorInstance = easyMDE_en;
                fileInput.click();
            });
        }
        if (urlBtnEn) {
            urlBtnEn.addEventListener('click', () => {
                targetEditorInstance = easyMDE_en;
                addImageByUrl();
            });
        }


        // File input change handler (uploads and inserts into the target editor)
        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (!targetEditorInstance) return; // Don't do anything if we don't know where to insert

                const file = fileInput.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('image', file);

                fetch('/upload-image', { /* ... fetch options ... */ credentials: 'include' })
                    .then(response => response.ok ? response.json() : Promise.reject(response))
                    .then(data => {
                        if (data.imageUrl) {
                            const markdownImage = `\n![Description](${data.imageUrl})\n`;
                            insertTextAtCursor(targetEditorInstance, markdownImage); // Use target
                        } else { /* ... error handling ... */ }
                    })
                    .catch(error => { /* ... error handling ... */ })
                    .finally(() => {
                         fileInput.value = '';
                         targetEditorInstance = null; // Reset target
                    });
            });
        }

        // Add by URL function
        function addImageByUrl() {
             if (!targetEditorInstance) return;
             const url = prompt("URL de l'image:");
             if (!url) { targetEditorInstance = null; return; }
             const alt = prompt("Description:", "Description image");
             const markdownImage = `\n![${alt || 'Description'}](${url})\n`;
             insertTextAtCursor(targetEditorInstance, markdownImage); // Use target
             targetEditorInstance = null; // Reset target
        }

    }, 150); // Slightly longer delay to ensure instances are ready
});