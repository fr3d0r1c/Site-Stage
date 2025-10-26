// Make translateText globally available
window.translateText = async function(text, targetLang = 'en-GB', type = 'content') {
    const titleEnInput = document.getElementById('title_en');
    const previewEnDiv = document.getElementById('preview_en');
    const contentEnTextarea = document.getElementById('content_en'); // Hidden EN textarea

    // Choose where to display loading/error messages
    const targetElement = (type === 'title') ? titleEnInput : previewEnDiv;
    const targetInput = (type === 'title') ? titleEnInput : contentEnTextarea; // Target for final value

    if (!targetElement || !targetInput) {
        console.error(`Target element missing for translation type: ${type}`);
        return; // Exit if elements aren't found
    }

    try {
        // Indicate loading
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
            throw new Error(`API Error: ${data.error || response.statusText}`);
        }

        if (data && data.translatedText) {
            // Update the correct element
            if (type === 'title') {
                targetElement.value = data.translatedText;
            } else {
                // Update both the hidden textarea (raw translation) AND the preview (parsed HTML)
                targetInput.value = data.translatedText; // Store raw translated Markdown
                if (typeof marked !== 'undefined') {
                     targetElement.innerHTML = marked.parse(data.translatedText); // Display parsed HTML
                } else {
                     targetElement.innerText = data.translatedText; // Fallback
                }
            }
        } else {
            throw new Error('Unexpected response from server.');
        }

    } catch (error) {
        console.error(`Error during ${type} translation:`, error);
        if (type === 'title') {
            targetElement.value = 'Translation Error.';
        } else {
            targetElement.innerHTML = '<i>Translation Error.</i>';
        }
        // Clear hidden EN textarea on error too
        if (type === 'content' && contentEnTextarea) {
             contentEnTextarea.value = 'Translation Error.';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // We also need to trigger title translation from the FR title input directly
    const titleFrInput = document.getElementById('title_fr');
    let titleDebounceTimer;

    if (titleFrInput) {
        titleFrInput.addEventListener('input', () => {
            clearTimeout(titleDebounceTimer);
            const textToTranslate = titleFrInput.value;

            if (textToTranslate.trim() && typeof window.translateText === 'function') {
                titleDebounceTimer = setTimeout(() => {
                    window.translateText(textToTranslate, 'en-GB', 'title'); // Pass 'title' type
                }, 700);
            } else {
                 const titleEnInput = document.getElementById('title_en');
                 if(titleEnInput) titleEnInput.value = ''; // Clear EN title if FR is empty
            }
        });
    }

    // Trigger initial translation for edit page if FR content exists
    const contentFrEditor = document.getElementById('content-editor-fr');
     if (contentFrEditor && contentFrEditor.value.trim() && typeof window.translateText === 'function') {
         // Use a small delay to ensure EasyMDE is potentially ready
         setTimeout(()=> window.translateText(contentFrEditor.value, 'en-GB', 'content'), 200);
     }
     if (titleFrInput && titleFrInput.value.trim() && typeof window.translateText === 'function') {
         setTimeout(()=> window.translateText(titleFrInput.value, 'en-GB', 'title'), 200);
     }
});