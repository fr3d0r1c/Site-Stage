// Fonction globale de traduction
window.translateText = async function(text, targetLang = 'en-GB', type = 'content') {
    const titleEnInput = document.getElementById('title_en');
    const previewEnDiv = document.getElementById('preview_en');
    const contentEnTextarea = document.getElementById('content_en'); // Textarea cachée

    // Détermine l'élément visuel à mettre à jour (feedback)
    const targetElement = (type === 'title') ? titleEnInput : previewEnDiv;
    // Détermine où stocker la valeur finale
    const targetInput = (type === 'title') ? titleEnInput : contentEnTextarea;

    if (!targetElement || !targetInput) return;

    try {
        // Indicateur de chargement
        if (type === 'title') {
            targetElement.value = 'Translating...';
        } else {
            targetElement.innerHTML = '<i>Translating...</i>';
        }

        // Appel API
        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, targetLang: targetLang }),
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`API Error: ${data.error || response.statusText}`);
        }

        if (data && typeof data.translatedText === 'string') {
            if (type === 'title') {
                // Mise à jour du Titre EN
                targetElement.value = data.translatedText;
            } else {
                // Mise à jour du Contenu EN
                
                // 1. Stocker le Markdown brut traduit dans la textarea cachée (pour la BDD)
                targetInput.value = data.translatedText;

                // 2. Afficher le HTML dans l'aperçu (en nettoyant le titre H1)
                if (typeof marked !== 'undefined') {
                     // Enlève la première ligne # Titre pour l'affichage
                     const cleanTranslated = data.translatedText.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                     targetElement.innerHTML = marked.parse(cleanTranslated);
                } else {
                     targetElement.innerText = data.translatedText;
                }
            }
        } else {
            throw new Error('Réponse inattendue.');
        }

    } catch (error) {
        console.error(`Erreur traduction (${type}):`, error);
        if (type === 'title') {
            targetElement.value = 'Translation Error.';
        } else {
            targetElement.innerHTML = '<i>Translation Error.</i>';
        }
        if (type === 'content' && contentEnTextarea) {
             contentEnTextarea.value = 'Translation Error.';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // --- Écouteur pour le Titre FR ---
    const titleFrInput = document.getElementById('title_fr');
    let titleDebounceTimer;

    if (titleFrInput) {
        titleFrInput.addEventListener('input', () => {
            clearTimeout(titleDebounceTimer);
            const textToTranslate = titleFrInput.value;

            if (textToTranslate.trim() && typeof window.translateText === 'function') {
                titleDebounceTimer = setTimeout(() => {
                    window.translateText(textToTranslate, 'en-GB', 'title');
                }, 700);
            } else {
                 // Vide le titre EN si FR est vide
                 const titleEnInput = document.getElementById('title_en');
                 if(titleEnInput) titleEnInput.value = '';
            }
        });
    }

    // --- Traduction Initiale (Page de modification) ---
    // On utilise un délai pour laisser le temps aux valeurs d'être peuplées
    setTimeout(() => {
        const contentFrEditor = document.getElementById('content-editor-fr');
        const titleFrElement = document.getElementById('title_fr'); // Récupérer l'élément à nouveau
        
        // Traduction initiale du contenu
        if (contentFrEditor && contentFrEditor.value.trim() && typeof window.translateText === 'function') {
             // On vérifie si l'éditeur EasyMDE a pris la main, sinon on prend la value du textarea
             const initialContent = window.easyMDEInstance ? window.easyMDEInstance.value() : contentFrEditor.value;
             if(initialContent.trim()) {
                window.translateText(initialContent, 'en-GB', 'content');
             }
        }
        
        // Traduction initiale du titre
        if (titleFrElement && titleFrElement.value.trim() && typeof window.translateText === 'function') {
             window.translateText(titleFrElement.value, 'en-GB', 'title');
        }
    }, 300);
});