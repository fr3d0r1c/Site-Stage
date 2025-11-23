document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('g-name');
    const emailInput = document.getElementById('g-email');
    const styleInput = document.getElementById('g-style');
    
    const avatarPreview = document.getElementById('avatar-preview');
    const namePreview = document.getElementById('name-preview');
    const statusBadge = document.getElementById('status-badge');
    
    const form = document.getElementById('guest-profile-form');
    const resetBtn = document.getElementById('guest-reset-btn');

    // --- FONCTION : Mettre à jour l'aperçu ---
    function updatePreview() {
        const name = nameInput.value.trim() || 'Invité';
        const style = styleInput.value;
        
        // Génération URL Avatar
        const seed = encodeURIComponent(name);
        const avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
        
        avatarPreview.src = avatarUrl;
        namePreview.textContent = name;
    }

    // --- FONCTION : Charger les données ---
    function loadData() {
        const storedName = localStorage.getItem('blog_guest_username');
        const storedEmail = localStorage.getItem('blog_guest_email');
        const storedStyle = localStorage.getItem('blog_guest_avatar_style') || 'bottts';

        if (storedName && storedEmail) {
            nameInput.value = storedName;
            emailInput.value = storedEmail;
            styleInput.value = storedStyle;
            
            statusBadge.textContent = "ACTIF";
            statusBadge.style.backgroundColor = "var(--c-primary)"; // Vert/Bleu du thème
            updatePreview();
        } else {
            updatePreview(); // Affiche l'avatar par défaut "Invité"
        }
    }

    // --- ÉVÉNEMENTS ---

    // Mise à jour en temps réel de l'avatar quand on tape ou change le style
    nameInput.addEventListener('input', updatePreview);
    styleInput.addEventListener('change', updatePreview);

    // Sauvegarde
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        localStorage.setItem('blog_guest_username', nameInput.value.trim());
        localStorage.setItem('blog_guest_email', emailInput.value.trim());
        localStorage.setItem('blog_guest_avatar_style', styleInput.value);

        statusBadge.textContent = "ACTIF";
        statusBadge.style.backgroundColor = "var(--c-primary)";
        
        Swal.fire({
            icon: 'success',
            title: 'Profil enregistré !',
            text: 'Vos futurs commentaires utiliseront cette identité.',
            timer: 2000,
            showConfirmButton: false
        });
    });

    // Suppression (Déconnexion)
    resetBtn.addEventListener('click', () => {
        Swal.fire({
            title: 'Tout effacer ?',
            text: "Cela supprimera votre profil de ce navigateur.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Oui, effacer'
        }).then((result) => {
            if (result.isConfirmed) {
                localStorage.removeItem('blog_guest_username');
                localStorage.removeItem('blog_guest_email');
                localStorage.removeItem('blog_guest_avatar_style');
                
                // Reset champs
                nameInput.value = '';
                emailInput.value = '';
                styleInput.value = 'bottts';
                
                statusBadge.textContent = "NON CONFIGURÉ";
                statusBadge.style.backgroundColor = "#ccc";
                updatePreview();

                Swal.fire('Effacé', 'Votre profil invité a été supprimé.', 'success');
            }
        });
    });

    // Lancement au chargement
    loadData();
});