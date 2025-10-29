window.translateText = async function(text, targetLang = 'en-GB', type = 'content') {
    const titleEnInput = document.getElementById('title_en');
    const previewEnDiv = document.getElementById('preview_en');
    const contentEnTextarea = document.getElementById('content_en');
    
    const targetElement = (type === 'title') ? titleEnInput : previewEnDiv;
    const targetInput = (type === 'title') ? titleEnInput : contentEnTextarea;

    if (!targetElement || !targetInput) {
        console.error(`Élément cible manquant pour le type de traduction : ${type}`);
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
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Erreur API: ${data.error || response.statusText}`);
        }

        if (data && typeof data.translatedText === 'string') {
            if (type === 'title') {
                targetElement.value = data.translatedText;
            } else {
                targetInput.value = data.translatedText;
                if (typeof marked !== 'undefined') {
                    targetElement.innerHTML = marked.parse(data.translatedText);
                } else {
                    targetElement.innerText = data.translatedText;
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