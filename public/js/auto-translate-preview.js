window.translateText = async function(text, targetLang = 'en-GB', type = 'content') {

    if (!text || text.trim() === '') return;

    const titleEnInput = document.getElementById('title_en');
    const previewEnDiv = document.getElementById('preview_en');
    const contentEnTextarea = document.getElementById('content_en');

    const targetElement = (type === 'title') ? titleEnInput : previewEnDiv;
    const targetInput = (type === 'title') ? titleEnInput : contentEnTextarea;

    if (!targetElement || !targetInput) return;

    try {
        if (type === 'title') {
            targetElement.value = 'Translating...';
        } else {
            targetElement.innerHTML = '<i>Translating...</i>';
        }

        let textToTranslate = text;
        const codeBlocks = [];

        if (type === 'content') {
            const codeBlockRegex = /```[\s\S]*?```/g;

            textToTranslate = text.replace(codeBlockRegex, (match) => {
                codeBlocks.push(match);
                return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
            });
        }

        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textToTranslate, targetLang: targetLang }),
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) throw new Error(`Erreur API: ${data.error || response.statusText}`);

        if (data && typeof data.translatedText === 'string') {
            let finalTranslatedText = data.translatedText;

            if (type === 'content') {
                codeBlocks.forEach((block, index) => {
                    const placeholderRegex = new RegExp(`__CODE_BLOCK_${index}__`, 'g');
                    finalTranslatedText = finalTranslatedText.replace(placeholderRegex, block);
                });
            }

            if (type === 'title') {
                targetElement.value = finalTranslatedText;
            } else {
                targetInput.value = finalTranslatedText;

                if (typeof marked !== 'undefined') {
                    const cleanTranslated = finalTranslatedText.replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
                    targetElement.innerHTML = marked.parse(cleanTranslated);

                    if (typeof hljs !== 'undefined') {
                        targetElement.querySelectorAll('pre code').forEach((block) => {
                            hljs.highlightElement(block);
                        });
                        if (typeof addCopyButtons === 'function') addCopyButtons();
                    }
                } else {
                    targetElement.innerText = finalTranslatedText;
                }
            }
        } else {
            throw new Error('Réponse inattendue.');
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