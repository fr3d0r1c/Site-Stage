document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('upload-image-btn');
    const fileInput = document.getElementById('image-upload-input');
    const urlBtn = document.getElementById('add-url-image-btn');
    
    // Check if the EasyMDE instance exists (created in init-easymde.js)
    const easyMDE = window.easyMDEInstance; 

    if (!easyMDE) {
        // console.warn("EasyMDE instance not found for uploader.");
        return; // Don't proceed if the editor isn't initialized
    }

    // Function to insert text into EasyMDE at the cursor position
    function insertTextAtCursor(text) {
        const cm = easyMDE.codemirror;
        const doc = cm.getDoc();
        const cursor = doc.getCursor();
        doc.replaceRange(text, cursor);
    }

    // File upload logic
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('image', file);

            fetch('/upload-image', { // Make sure this endpoint exists and is authenticated
                method: 'POST',
                body: formData,
                credentials: 'include' // Important for authentication
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
             })
            .then(data => {
                if (data.imageUrl) {
                    const markdownImage = `\n![Description de l'image](${data.imageUrl})\n`;
                    insertTextAtCursor(markdownImage); // Use the function to insert
                } else {
                    alert("L'upload a échoué : " + (data.error || 'Erreur inconnue'));
                }
            })
            .catch(error => {
                console.error("Erreur lors de l'upload:", error);
                alert(`L'upload de l'image a échoué: ${error.message}`);
            });
            
            fileInput.value = '';
        });
    }

    // Add via URL logic
    if (urlBtn) {
        urlBtn.addEventListener('click', () => {
            const url = prompt("Veuillez coller l'URL de l'image (ex: https://...) :");
            if (!url) return;
            const alt = prompt("Veuillez entrer une courte description (texte alternatif) :", "Description de l'image");

            const markdownImage = `\n![${alt || 'Description'}](${url})\n`;
            insertTextAtCursor(markdownImage); // Use the function to insert
        });
    }
});