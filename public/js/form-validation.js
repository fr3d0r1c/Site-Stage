// public/js/form-validation.js

// --- 1. Initialisation de la traduction (Edit page) ---
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const contentFrEditor = document.getElementById('content-editor-fr');
        const titleFrInput = document.getElementById('title_fr');
        
        if (typeof window.translateText !== 'function') return;

        // Traduction contenu
        if (contentFrEditor && contentFrEditor.value.trim()) {
            const initialContent = contentFrEditor.value;
            if(initialContent.trim()) window.translateText(initialContent, 'en-GB', 'content');
        }
        // Traduction titre
        if (titleFrInput && titleFrInput.value.trim()) {
            const initialTitle = titleFrInput.value;
            if (initialTitle.trim()) window.translateText(initialTitle, 'en-GB', 'title');
        }
    }, 500);
});


// --- 2. Validation du formulaire avec SweetAlert2 ---
document.addEventListener('easyMDEReady', (e) => {
    console.log("EasyMDE prêt, validation active.");
    const easyMDEInstance = e.detail.instance;
    const submitBtn = document.getElementById('submit-button');
    const form = document.getElementById('entry-form');
    const contentEnTextarea = document.getElementById('content_en');

    if (submitBtn && form && contentEnTextarea) {
        submitBtn.addEventListener('click', function(event) {
            // Empêche l'envoi immédiat
            event.preventDefault(); 

            // Synchronise EasyMDE
            if (easyMDEInstance) easyMDEInstance.codemirror.save();

            let errorFound = false; // Drapeau pour ne montrer qu'une erreur à la fois

            // 1. Vérification des champs standards
            const requiredInputs = form.querySelectorAll('input[required], textarea[required]');
            for (const input of requiredInputs) {
                let valueToCheck = input.value;
                
                // Vérification spécifique pour le contenu anglais caché
                if (input.id === 'content_en') {
                    valueToCheck = contentEnTextarea.value;
                    if (!valueToCheck.trim() || valueToCheck.includes('Translating...') || valueToCheck.includes('Translation Error.')) {
                        Swal.fire({
                            icon: 'warning',
                            title: 'Traduction incomplète',
                            text: 'La traduction anglaise est requise ou en cours.',
                            confirmButtonColor: 'var(--c-primary)'
                        });
                        errorFound = true;
                        break; // Arrête la boucle
                    }
                }
                // Vérification standard
                else if (!valueToCheck.trim()) {
                    const label = form.querySelector(`label[for="${input.id}"]`);
                    const fieldName = label ? label.innerText.replace(' :', '') : input.name;
                    
                    Swal.fire({
                        icon: 'warning',
                        title: 'Champ manquant',
                        text: `Le champ "${fieldName}" est requis.`,
                        confirmButtonColor: 'var(--c-primary)'
                    });
                    
                    try { input.focus(); } catch(e){}
                    errorFound = true;
                    break; // Arrête la boucle pour ne pas spammer l'utilisateur
                }
            }

            // 2. Vérification spécifique EasyMDE (Contenu FR)
            if (!errorFound) {
                const frenchContent = easyMDEInstance ? easyMDEInstance.value() : '';
                if (!frenchContent.trim()) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Contenu manquant',
                        text: 'Le contenu français ne peut pas être vide.',
                        confirmButtonColor: 'var(--c-primary)'
                    });
                    try { easyMDEInstance.codemirror.focus(); } catch(e){}
                    errorFound = true;
                }
            }

            // 3. Si tout est bon, on envoie le formulaire !
            if (!errorFound) {
                form.submit();
            }
        });
    }
});