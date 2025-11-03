// public/js/form-validation.js

// --- Logique pour le déclenchement de la traduction initiale (Edit page) ---
// Cette partie peut s'exécuter au chargement du DOM,
// mais on ajoute un délai pour laisser le temps à 'auto-translate-preview.js' de se charger.
document.addEventListener('DOMContentLoaded', () => {
    
    // Ajoute un petit délai pour s'assurer que window.translateText existe
    setTimeout(() => {
        const contentFrEditor = document.getElementById('content-editor-fr');
        const titleFrInput = document.getElementById('title_fr');
        
        if (typeof window.translateText !== 'function') {
            console.warn("form-validation.js: window.translateText n'est pas encore prêt pour la traduction initiale.");
            return;
        }

        // Déclenche la traduction initiale pour le contenu (page d'édition)
        if (contentFrEditor && contentFrEditor.value.trim()) {
            const initialContent = contentFrEditor.value;
            if(initialContent.trim()){
                window.translateText(initialContent, 'en-GB', 'content');
            }
        }
        // Déclenche la traduction initiale pour le titre (page d'édition)
        if (titleFrInput && titleFrInput.value.trim()) {
            const initialTitle = titleFrInput.value;
            if (initialTitle.trim()) {
                window.translateText(initialTitle, 'en-GB', 'title');
            }
        }
    }, 500); // Un délai de 500ms devrait être suffisant
});


// --- Logique pour la validation du formulaire (Soumission) ---
// CETTE PARTIE ATTEND LE SIGNAL 'easyMDEReady'
document.addEventListener('easyMDEReady', (e) => {
    
    console.log("EasyMDE est prêt, le script de validation s'active.");
    
    // Récupère l'instance de l'éditeur directement depuis l'événement
    const easyMDEInstance = e.detail.instance;

    const submitBtn = document.getElementById('submit-button');
    const form = document.getElementById('entry-form');
    const contentEnTextarea = document.getElementById('content_en'); // Textarea cachée EN

    if (submitBtn && form && contentEnTextarea) {
        submitBtn.addEventListener('click', function(event) {
            
            // Force EasyMDE FR à copier son contenu dans la textarea cachée 'content_fr'
            if (easyMDEInstance) {
                easyMDEInstance.codemirror.save();
            } else {
                console.error("Erreur Validation : Instance EasyMDE non trouvée au moment du clic !");
                // On pourrait bloquer ici si l'éditeur est critique
            }

            let isValid = true;
            // Sélectionne tous les champs requis
            const requiredInputs = form.querySelectorAll('input[required], textarea[required]');

            requiredInputs.forEach(input => {
                 // Vérifie la textarea EN cachée
                 if (input.id === 'content_en') {
                     if (!input.value.trim() || input.value.includes('Translating...') || input.value.includes('Translation Error.')) {
                          isValid = false;
                          alert('La traduction anglaise du contenu est requise ou n\'est pas terminée/valide.');
                     }
                 }
                 // Vérification standard pour les autres
                 else if (!input.value.trim()) {
                     isValid = false;
                     const label = form.querySelector(`label[for="${input.id}"]`);
                     const fieldName = label ? label.innerText.replace(':', '') : input.name;
                     alert(`Le champ "${fieldName}" est requis.`);
                     try { input.focus(); } catch(e){}
                 }
            });

            // Vérification manuelle du contenu FR (EasyMDE)
            const frenchContent = easyMDEInstance ? easyMDEInstance.value() : '';
             if (!frenchContent.trim()) {
                 isValid = false;
                 alert('Le contenu français ne peut pas être vide.');
                 try { easyMDEInstance.codemirror.focus(); } catch(e){}
            }

            // Empêche l'envoi si invalide
            if (!isValid) {
                 event.preventDefault();
                 console.log('Soumission formulaire empêchée (validation).');
            } else {
                 console.log('Formulaire valide, soumission...');
            }
        });
    } else {
        console.warn("Validation formulaire n'a pas trouvé tous les éléments (submitBtn, form, contentEnTextarea).");
    }
}); // Fin de l'écouteur 'easyMDEReady'