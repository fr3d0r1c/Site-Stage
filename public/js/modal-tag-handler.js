document.addEventListener('DOMContentLoaded', () => {
    // Éléments de la modale
    const openBtn = document.getElementById('open-tag-modal-btn');
    const closeBtn = document.getElementById('close-tag-modal-btn');
    const overlay = document.getElementById('tag-modal-overlay');
    const modalForm = document.getElementById('new-tag-form');
    const errorDiv = document.getElementById('tag-modal-error');
    const checkboxList = document.querySelector('.tags-checkbox-list');
    
    // Éléments du formulaire de la modale
    const newTagFrInput = document.getElementById('new_tag_name_fr');
    const newTagEnInput = document.getElementById('new_tag_name_en');

    // Fonction pour ouvrir
    function openModal() {
        if (overlay) overlay.classList.add('modal-visible');
    }
    // Fonction pour fermer
    function closeModal() {
        if (overlay) overlay.classList.remove('modal-visible');
        if (errorDiv) errorDiv.style.display = 'none'; // Cache les erreurs
        if (modalForm) modalForm.reset(); // Vide le formulaire
    }

    // Événements pour ouvrir/fermer
    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            // Ferme seulement si on clique sur le fond (overlay) et non sur le contenu
            if (e.target === overlay) {
                closeModal();
            }
        });
    }

    // Gestion de la soumission du formulaire de la modale
    if (modalForm) {
        modalForm.addEventListener('submit', async function(event) {
            event.preventDefault(); // EMPÊCHE LE RECHARGEMENT DE LA PAGE
            
            const nameFr = newTagFrInput.value;
            const nameEn = newTagEnInput.value;

            // Prépare le corps de la requête
            const body = {
                name_fr: nameFr,
                name_en_auto: false // Par défaut, on n'auto-traduit pas
            };

            if (nameEn) {
                body.name_en = nameEn; // Si l'utilisateur a fourni un nom EN, on l'envoie
            } else {
                body.name_en_auto = true; // Sinon, on demande à l'API de traduire
            }

            try {
                const response = await fetch('/api/tags/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    credentials: 'include' // Important pour l'authentification
                });

                const newTag = await response.json();

                if (!response.ok) {
                    // Affiche l'erreur de l'API (ex: "Tag déjà existant")
                    throw new Error(newTag.error || 'Erreur inconnue');
                }

                // SUCCÈS !
                // 1. Ajoute dynamiquement la nouvelle case à cocher
                if (checkboxList) {
                    addNewTagCheckbox(newTag);
                }
                // 2. Ferme la modale
                closeModal();

            } catch (err) {
                // Affiche l'erreur dans la modale
                if (errorDiv) {
                    errorDiv.textContent = err.message;
                    errorDiv.style.display = 'block';
                }
                console.error('Erreur création tag via modale:', err);
            }
        });
    }

    // Fonction pour ajouter dynamiquement la nouvelle case à cocher
    function addNewTagCheckbox(tag) {
        const div = document.createElement('div');
        div.className = 'tag-checkbox-item';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'tags';
        input.value = tag.id;
        input.id = `tag-${tag.id}`;
        input.checked = true; // Coche-le automatiquement

        const label = document.createElement('label');
        label.htmlFor = `tag-${tag.id}`;
        label.textContent = tag.name; // 'name' est dans la langue de l'utilisateur (grâce à l'API)

        div.appendChild(input);
        div.appendChild(label);
        
        // Gère le cas "Aucun tag disponible"
        const noTagMessage = checkboxList.querySelector('p');
        if (noTagMessage) {
            noTagMessage.remove();
        }

        checkboxList.appendChild(div);
    }
});