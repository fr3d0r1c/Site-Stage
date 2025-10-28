// Rendre translateText accessible globalement
window.translateText = async function(text, targetLang = 'en-GB', type = 'content') {
    const titleEnInput = document.getElementById('title_en');
    const previewEnDiv = document.getElementById('preview_en');
    const contentEnTextarea = document.getElementById('content_en'); // Textarea cachée EN

    // Choisir où afficher les messages de chargement/erreur
    const targetElement = (type === 'title') ? titleEnInput : previewEnDiv;
    // Choisir où stocker la traduction finale (input ou textarea cachée)
    const targetInput = (type === 'title') ? titleEnInput : contentEnTextarea;

    if (!targetElement || !targetInput) {
        console.error(`Élément cible manquant pour le type de traduction : ${type}`);
        return; // Sortir si les éléments ne sont pas trouvés
    }

    try {
        // Indiquer le chargement
        if (type === 'title') {
            targetElement.value = 'Translating...';
        } else {
            targetElement.innerHTML = '<i>Translating...</i>';
        }

        // Appel à l'API du serveur principal (chemin relatif)
        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, targetLang: targetLang }),
            credentials: 'include' // Envoyer les cookies de session pour l'authentification
        });

        // Tenter de lire la réponse JSON, même en cas d'erreur HTTP
        const data = await response.json();

        if (!response.ok) {
            // Utiliser le message d'erreur du serveur si disponible
            throw new Error(`Erreur API: ${data.error || response.statusText}`);
        }

        // Vérifier si la traduction est présente dans la réponse
        if (data && typeof data.translatedText === 'string') {
            // Mettre à jour l'élément correct
            if (type === 'title') {
                targetElement.value = data.translatedText; // Met à jour l'input titre EN
            } else {
                // Met à jour la textarea cachée EN (avec le Markdown brut traduit)
                targetInput.value = data.translatedText;
                // Met à jour l'aperçu EN (avec le HTML parsé)
                if (typeof marked !== 'undefined') {
                     targetElement.innerHTML = marked.parse(data.translatedText);
                } else {
                     targetElement.innerText = data.translatedText; // Fallback si marked non chargé
                }
            }
        } else {
            // Gérer une réponse réussie mais inattendue
            throw new Error('Réponse inattendue du serveur.');
        }

    } catch (error) {
        console.error(`Erreur durant la traduction (${type}):`, error);
        // Afficher l'erreur dans le champ approprié
        if (type === 'title') {
            targetElement.value = 'Translation Error.';
        } else {
            targetElement.innerHTML = '<i>Translation Error.</i>';
        }
        // Mettre à jour/vider la textarea cachée EN en cas d'erreur de contenu
        if (type === 'content' && contentEnTextarea) {
             contentEnTextarea.value = 'Translation Error.'; // Stocke l'indication d'erreur
        }
    }
};

// Écouteurs pour déclencher la traduction depuis le titre FR et au chargement
document.addEventListener('DOMContentLoaded', () => {
    // Déclencher la traduction du titre quand on tape dans le champ Titre FR
    const titleFrInput = document.getElementById('title_fr');
    let titleDebounceTimer;

    if (titleFrInput) {
        titleFrInput.addEventListener('input', () => {
            clearTimeout(titleDebounceTimer);
            const textToTranslate = titleFrInput.value;

            // Déclencher seulement si la fonction existe et qu'il y a du texte
            if (textToTranslate.trim() && typeof window.translateText === 'function') {
                titleDebounceTimer = setTimeout(() => {
                    // Appeler la fonction globale, spécifier le type 'title'
                    window.translateText(textToTranslate, 'en-GB', 'title');
                }, 700); // Délai après la fin de la frappe pour le titre
            } else {
                 // Vider le titre EN si le titre FR est vide
                 const titleEnInput = document.getElementById('title_en');
                 if(titleEnInput) titleEnInput.value = '';
            }
        });
    }

    // Déclencher la traduction initiale pour la page de modification si du contenu existe déjà
    // Vérifie la valeur initiale de la textarea originale (remplie par EJS)
    const contentFrEditor = document.getElementById('content-editor-fr');
     if (contentFrEditor && contentFrEditor.value.trim() && typeof window.translateText === 'function') {
         // Utilise un petit délai pour s'assurer qu'EasyMDE est prêt
         setTimeout(()=> {
             // Relit la valeur au cas où EasyMDE l'aurait modifiée, ou utilise celle de EJS
             const initialContent = contentFrEditor.value;
             if(initialContent.trim()) {
                window.translateText(initialContent, 'en-GB', 'content');
             }
         }, 200);
     }
     if (titleFrInput && titleFrInput.value.trim() && typeof window.translateText === 'function') {
         setTimeout(()=> {
             const initialTitle = titleFrInput.value;
             if (initialTitle.trim()) {
                window.translateText(initialTitle, 'en-GB', 'title');
             }
         }, 200);
     }
});