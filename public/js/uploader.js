document.addEventListener('DOMContentLoaded', () => {
    // Input de fichier caché (déclenché par le bouton image d'EasyMDE)
    const fileInput = document.getElementById('image-upload-input');
    // On pourrait aussi gérer le bouton 'Ajouter par URL' ici si on le remettait

    // Attend que l'instance EasyMDE soit prête (initialisée par init-easymde.js)
    setTimeout(() => {
        // Récupère l'instance EasyMDE française (rendue globale par init-easymde.js)
        const easyMDE = window.easyMDEInstance;

        // Si l'éditeur n'est pas prêt, on ne fait rien
        if (!easyMDE) {
            console.warn("L'instance EasyMDE n'a pas été trouvée pour uploader.js.");
            return;
        }

        // Fonction pour insérer du texte dans EasyMDE à la position du curseur
        function insertTextAtCursor(text) {
            const cm = easyMDE.codemirror; // Accède à l'instance CodeMirror sous-jacente
            const doc = cm.getDoc();
            const cursor = doc.getCursor(); // Obtient la position actuelle du curseur
            doc.replaceRange(text, cursor); // Insère le texte à cette position
            cm.focus(); // Redonne le focus à l'éditeur
        }

        // --- Logique d'Upload de Fichier ---
        if (fileInput) {
            // Écoute l'événement 'change' sur l'input de fichier caché
            fileInput.addEventListener('change', () => {
                const file = fileInput.files[0]; // Récupère le fichier sélectionné
                if (!file) return; // Si aucun fichier n'est sélectionné, sort

                // Prépare les données pour l'envoi
                const formData = new FormData();
                formData.append('image', file); // Ajoute le fichier sous la clé 'image'

                console.log("Tentative d'upload de l'image..."); // Log de débogage

                // Envoie le fichier à l'API du serveur
                fetch('/upload-image', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include' // Important pour envoyer les cookies de session (authentification)
                })
                .then(response => {
                     // Vérifie si la réponse du serveur est OK (status 2xx)
                     if (!response.ok) {
                         // Si non OK, essaie de lire l'erreur JSON et rejette la promesse
                         return response.json().then(errData => Promise.reject(errData));
                     }
                     // Si OK, lit la réponse JSON
                     return response.json();
                 })
                .then(data => {
                    console.log("Réponse de l'upload:", data); // Log de débogage
                    // Si l'URL de l'image est bien présente dans la réponse
                    if (data.imageUrl) {
                        // Crée le texte Markdown pour l'image
                        const markdownImage = `\n![Description](${data.imageUrl})\n`;
                        // Insère le texte dans l'éditeur EasyMDE
                        insertTextAtCursor(markdownImage);
                    } else {
                        // Affiche une erreur si l'URL manque
                        alert("Erreur d'upload: " + (data.error || 'Réponse invalide du serveur'));
                    }
                })
                .catch(error => {
                    // Gère les erreurs (réseau, JSON invalide, erreur serveur)
                    console.error("Erreur fetch upload:", error);
                    // Affiche un message d'erreur plus clair à l'utilisateur
                    alert(`Échec de l'upload: ${error.error || error.message || 'Erreur inconnue'}`);
                })
                .finally(() => {
                     // Réinitialise l'input de fichier pour permettre un nouvel upload du même fichier
                     fileInput.value = '';
                });
            });
        }

        // --- Logique d'Ajout par URL (Si on remettait le bouton) ---
        /*
        const urlBtn = document.getElementById('add-url-image-btn'); // Si ce bouton existait
        if (urlBtn) {
            urlBtn.addEventListener('click', () => {
                const url = prompt("URL de l'image:"); if (!url) return;
                const alt = prompt("Description:", "Description image");
                insertTextAtCursor(`\n![${alt || 'Description'}](${url})\n`);
            });
        }
        */

    }, 150); // Léger délai pour s'assurer que easyMDEInstance est bien défini par init-easymde.js
});