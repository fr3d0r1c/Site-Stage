document.addEventListener('DOMContentLoaded', () => {
    const copyBtn = document.getElementById('copy-link-btn');
    const nativeBtn = document.getElementById('native-share-btn');
    const pageUrl = window.location.href;
    const pageTitle = document.title;

    // 1. Copier le lien
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(pageUrl).then(() => {
                // Feedback visuel via SweetAlert (Toast)
                const Toast = Swal.mixin({
                    toast: true, position: 'top-end', showConfirmButton: false, timer: 2000
                });
                Toast.fire({ icon: 'success', title: 'Lien copié !' });
            }).catch(err => {
                console.error('Erreur copie:', err);
            });
        });
    }

    // 2. Partage Natif (Web Share API)
    if (navigator.share && nativeBtn) {
        nativeBtn.style.display = 'flex'; // On l'affiche car le navigateur est compatible
        
        nativeBtn.addEventListener('click', () => {
            navigator.share({
                title: pageTitle,
                text: 'Découvre cet article sur mon carnet de stage :',
                url: pageUrl
            }).catch((error) => console.log('Partage annulé', error));
        });
    }
});