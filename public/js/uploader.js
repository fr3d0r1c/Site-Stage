document.addEventListener('DOMContentLoaded', () => {
    // On s'assure que les éléments existent sur la page
    const uploadBtn = document.getElementById('upload-image-btn');
    const fileInput = document.getElementById('image-upload-input');
    const contentEditor = document.getElementById('content-editor');

    if (uploadBtn && fileInput && contentEditor) {
        // Quand on clique sur notre bouton "Téléverser"
        uploadBtn.addEventListener('click', () => {
            fileInput.click(); // On déclenche l'input de fichier caché
        });

        // Quand un fichier est sélectionné
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
                    
                    // On déclenche un événement "input" pour que l'aperçu se mette à jour
                    contentEditor.dispatchEvent(new Event('input'));
                } else {
                    alert("L'upload a échoué : " + (data.error || 'Erreur inconnue'));
                }
            })
            .catch(error => {
                console.error("Erreur lors de l'upload:", error);
                alert("L'upload de l'image a échoué.");
            });
            
            // On réinitialise l'input
            fileInput.value = '';
        });
    }
});