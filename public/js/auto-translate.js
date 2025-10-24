/*
document.addEventListener('DOMContentLoaded', () => {
    const frenchContentEditor = document.getElementById('content-editor-fr');
    const englishContentEditor = document.getElementById('content_en'); // Tentative de sélection
    let debounceTimer;

    // === VÉRIFICATION IMPORTANTE ===
    // On n'exécute le reste que si les DEUX champs existent sur la page
    if (frenchContentEditor && englishContentEditor) {

        frenchContentEditor.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const textToTranslate = frenchContentEditor.value;

            if (!textToTranslate.trim()) {
                englishContentEditor.value = '';
                return;
            }

            debounceTimer = setTimeout(() => {
                translateText(textToTranslate);
            }, 1000);
        });
    } // Fin de la vérification

    async function translateText(text) {
        // === VÉRIFICATION SUPPLÉMENTAIRE ===
        // S'assure que englishContentEditor existe avant de l'utiliser
        if (!englishContentEditor) return; 

        try {
            englishContentEditor.value = 'Traduction en cours...';

            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, targetLang: 'en-GB' }),
                credentials: 'include'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(`Erreur API: ${data.error || response.statusText}`);
            }

            if (data && data.translatedText) {
                englishContentEditor.value = data.translatedText;
            } else {
                throw new Error('Réponse inattendue du serveur.');
            }

        } catch (error) {
            console.error("Erreur lors de l'appel de l'API de traduction:", error);
            // Vérifie encore avant d'écrire l'erreur
            if (englishContentEditor) {
                englishContentEditor.value = 'Erreur de traduction.'; 
            }
        }
    }
});
*/