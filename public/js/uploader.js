document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('upload-image-btn');
    const fileInput = document.getElementById('image-upload-input');
    // === TARGET FRENCH EDITOR ===
    const contentEditor = document.getElementById('content-editor-fr'); // Updated ID
    const urlBtn = document.getElementById('add-url-image-btn');

    // File upload logic
    if (uploadBtn && fileInput && contentEditor) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('image', file);

            fetch('/upload-image', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.imageUrl) {
                    // === INSERT INTO FRENCH EDITOR ===
                    const markdownImage = `\n![Description de l'image](${data.imageUrl})\n`;
                    contentEditor.value += markdownImage; // Inserts into FR editor
                    contentEditor.dispatchEvent(new Event('input')); // Triggers FR preview update
                } else {
                    alert("L'upload a échoué : " + (data.error || 'Erreur inconnue'));
                }
            })
            .catch(error => {
                console.error("Erreur lors de l'upload:", error);
                alert("L'upload de l'image a échoué.");
            });
            
            fileInput.value = '';
        });
    }

    // Add via URL logic
    if (urlBtn && contentEditor) {
        urlBtn.addEventListener('click', () => {
            const url = prompt("Veuillez coller l'URL de l'image (ex: https://...) :");
            if (!url) return;
            const alt = prompt("Veuillez entrer une courte description (texte alternatif) :", "Description de l'image");

            // === INSERT INTO FRENCH EDITOR ===
            const markdownImage = `\n![${alt || 'Description'}](${url})\n`;
            contentEditor.value += markdownImage; // Inserts into FR editor
            contentEditor.dispatchEvent(new Event('input')); // Triggers FR preview update
        });
    }
});