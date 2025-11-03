const submitBtn = document.getElementById('submit-button');
const form = document.getElementById('entry-form');
const contentEnTextarea = document.getElementById('content_en'); // Textarea cachée EN

if (submitBtn && form && contentEnTextarea) {
    submitBtn.addEventListener('click', function(event) {
        // Force EasyMDE FR à copier son contenu dans la textarea cachée 'content_fr'
        if (window.easyMDEInstance) {
            window.easyMDEInstance.codemirror.save();
        }
        
        let isValid = true;
        // Sélectionne tous les champs requis visibles + la textarea EN cachée
        const requiredInputs = form.querySelectorAll('input[required], textarea[required]');
        
        requiredInputs.forEach(input => {
            // Vérifie si la textarea EN cachée (qui est requise) a un contenu valide
            if (input.id === 'content_en') {
                if (!input.value.trim() || input.value.includes('Translating...') || input.value.includes('Translation Error.')) {
                    isValid = false;
                    alert('La traduction anglaise du contenu est requise ou n\'est pas terminée/valide.');
                    console.error('Validation failed: English content missing or invalid.');
                }
            }
            // Vérification standard pour les autres champs requis
            else if (!input.value.trim()) {
                isValid = false;
                const label = form.querySelector(`label[for="${input.id}"]`);
                const fieldName = label ? label.innerText.replace(':', '') : input.name;
                alert(`Le champ "${fieldName}" est requis.`);
                try { input.focus(); } catch(e){} 
                console.error(`Validation failed: Field "${input.name}" is empty.`);
            }
        });
        
        // Vérification manuelle du contenu FR dans EasyMDE (puisque sa textarea n'est pas 'required')
        const frenchContent = window.easyMDEInstance ? window.easyMDEInstance.value() : '';
        if (!frenchContent.trim()) {
            isValid = false;
            alert('Le contenu français ne peut pas être vide.');
            console.error('Validation failed: French content is empty in EasyMDE');
            try { window.easyMDEInstance.codemirror.focus(); } catch(e){} // Tente de mettre le focus
            }
            
            // Empêche l'envoi si invalide
            if (!isValid) {
                event.preventDefault();
                console.log('Form submission prevented due to validation errors.');
            } else {
                console.log('Form is valid, attempting submission...');
            }
        });
    }