document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('g-name');
    const styleInput = document.getElementById('g-style'); // Assure-toi que le select a cet ID

    const avatarPreview = document.getElementById('avatar-preview');
    const namePreview = document.getElementById('name-preview');

    // --- FONCTION : Mettre à jour l'aperçu en direct ---
    function updatePreview() {
        const name = nameInput.value.trim() || 'Invité';
        const style = styleInput ? styleInput.value : 'bottts';

        // Génération URL Avatar
        const seed = encodeURIComponent(name);
        const avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;

        if (avatarPreview) avatarPreview.src = avatarUrl;
        if (namePreview) namePreview.textContent = name;
    }

    // --- ÉVÉNEMENTS ---
    // On met à jour l'image dès qu'on tape ou change le style
    if (nameInput) nameInput.addEventListener('input', updatePreview);
    if (styleInput) styleInput.addEventListener('change', updatePreview);

    // Initialisation au chargement
    updatePreview();

    // NOTE : On a supprimé le "form.addEventListener('submit'...)"
    // On laisse le formulaire s'envoyer normalement au serveur.
});