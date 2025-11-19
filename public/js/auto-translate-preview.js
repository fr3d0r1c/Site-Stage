window.translateText = async function(text, targetLang = 'en-GB', type = 'content') {

    if (!text || text.trim() === '') {
        return;
    }

    const titleEnInput = document.getElementById('title_en');
    const previewEnDiv = document.getElementById('preview_en');
    const contentEnTextarea = document.getElementById('content_en'); // Textarea cachée EN

    const targetElement = (type === 'title') ? titleEnInput : previewEnDiv;
    const targetInput = (type === 'title') ? titleEnInput : contentEnTextarea;

    if (!targetElement || !targetInput) {
        return;
    }

    try {
        if (type === 'title') {
            targetElement.value = 'Translating...';
        } else {
            targetElement.innerHTML = '<i>Translating...</i>';
        }

        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, targetLang: targetLang }),
            credentials: 'include' // Envoyer les cookies de session pour l'authentification
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Erreur API: ${data.error || response.statusText}`);
        }
        
        if (data && typeof data.translatedText === 'string') {
            if (type === 'title') {
                targetElement.value = data.translatedText; // Met à jour l'input titre EN
            } else {
                targetInput.value = data.translatedText;

                if (typeof marked !== 'undefined') {
                    const cleanTranslated = data.translatedText.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                    targetElement.innerHTML = marked.parse(cleanTranslated);
                } else {
                    targetElement.innerText = data.translatedText; // Fallback si marked non chargé
                }
            }
        } else {
            throw new Error('Réponse inattendue du serveur.');
        }
    } catch (error) {
        console.error(`Erreur durant la traduction (${type}):`, error);
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
                const titleEnInput = document.getElementById('title_en');
                if(titleEnInput) titleEnInput.value = '';
            }
        });
    }

    const contentFrEditor = document.getElementById('content-editor-fr');
    if (contentFrEditor && contentFrEditor.value.trim() && typeof window.translateText === 'function') {
        setTimeout(()=> {
            const initialContent = window.easyMDEInstance ? window.easyMDEInstance.value() : contentFrEditor.value;

            if(initialContent && initialContent.trim() !== '') {
                window.translateText(initialContent, 'en-GB', 'content');
            }
        }, 300);
    }

    if (titleFrInput && titleFrInput.value.trim() && typeof window.translateText === 'function') {
        setTimeout(()=> {
            const initialTitle = titleFrInput.value;
            if (initialTitle.trim()) {
                window.translateText(initialTitle, 'en-GB', 'title');
            }
        }, 300);
    }
});