document.addEventListener('DOMContentLoaded', () => {
    // On s'assure que les éléments existent avant d'ajouter des listeners
    const uploadBtn = document.getElementById('upload-image-btn');
    const fileInput = document.getElementById('image-upload-input');
    const contentEditor = document.getElementById('content-editor');
    const urlBtn = document.getElementById('add-url-image-btn'); // Ajout du nouveau bouton

    // Logique pour le téléversement de fichier
    if (uploadBtn && fileInput && contentEditor) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click(); // Ouvre la fenêtre de sélection de fichier
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('image', file);

            // On envoie le fichier à notre API
            fetch('/upload-image', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.imageUrl) {
                    // On insère le Markdown de l'image dans l'éditeur
                    const markdownImage = `\n![Description de l'image](${data.imageUrl})\n`;
                    contentEditor.value += markdownImage;
                    
                    // On déclenche manuellement un événement 'input' pour que l'aperçu se mette à jour
                    contentEditor.dispatchEvent(new Event('input'));
                } else {
                    alert("L'upload a échoué : " + (data.error || 'Erreur inconnue'));
                }
            })
            .catch(error => {
                console.error("Erreur lors de l'upload:", error);
                alert("L'upload de l'image a échoué.");
            });
            
            // On réinitialise l'input pour pouvoir uploader le même fichier à nouveau
            fileInput.value = '';
        });
    }

    // Logique pour l'ajout par URL
    if (urlBtn && contentEditor) {
        urlBtn.addEventListener('click', () => {
            // 1. Demander l'URL de l'image
            const url = prompt("Veuillez coller l'URL de l'image (ex: https://...) :");
            
            if (!url) {
                return; // Si l'utilisateur clique sur "Annuler" ou ne met rien
            }

            // 2. Demander la description (texte alternatif)
            const alt = prompt("Veuillez entrer une courte description (texte alternatif) :", "Description de l'image");

            // 3. Insérer le Markdown dans l'éditeur
            const markdownImage = `\n![${alt || 'Description'}](${url})\n`; // On met 'Description' si alt est vide
            contentEditor.value += markdownImage;
            
            // 4. Mettre à jour l'aperçu
            contentEditor.dispatchEvent(new Event('input'));
        });
    }
});