document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('upload-image-btn');
    const fileInput = document.getElementById('image-upload-input');
    const urlBtn = document.getElementById('add-url-image-btn');

    // Vérifie si l'instance EasyMDE existe (créée dans init-easymde.js)
    // On attend un court instant au cas où EasyMDE s'initialise après ce script
    setTimeout(() => {
        const easyMDE = window.easyMDEInstance;

        if (!easyMDE) {
            console.warn("L'instance EasyMDE n'a pas été trouvée pour uploader.js.");
            return; // Ne pas continuer si l'éditeur n'est pas prêt
        }

        // Fonction pour insérer du texte dans EasyMDE au curseur
        function insertTextAtCursor(text) {
            const cm = easyMDE.codemirror;
            const doc = cm.getDoc();
            const cursor = doc.getCursor();
            doc.replaceRange(text, cursor);
        }

        // Logique d'upload de fichier
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => { fileInput.click(); });
            fileInput.addEventListener('change', () => {
                const file = fileInput.files[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('image', file);
                fetch('/upload-image', { method: 'POST', body: formData, credentials: 'include' })
                    .then(response => response.ok ? response.json() : Promise.reject(response))
                    .then(data => {
                        if (data.imageUrl) {
                            const markdownImage = `\n![Description](${data.imageUrl})\n`;
                            insertTextAtCursor(markdownImage);
                        } else { alert("Erreur d'upload: " + (data.error || 'Inconnue')); }
                    })
                    .catch(error => { console.error("Erreur fetch upload:", error); alert(`Échec upload: ${error.message || error.statusText || 'Erreur réseau'}`); })
                    .finally(() => { fileInput.value = ''; });
            });
        }

        // Logique d'ajout par URL
        if (urlBtn) {
            urlBtn.addEventListener('click', () => {
                const url = prompt("URL de l'image:");
                if (!url) return;
                const alt = prompt("Description:", "Description image");
                const markdownImage = `\n![${alt || 'Description'}](${url})\n`;
                insertTextAtCursor(markdownImage);
            });
        }
    }, 100); // Petit délai pour laisser EasyMDE s'initialiser

});