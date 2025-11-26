document.addEventListener('DOMContentLoaded', () => {
    const shareBtn = document.getElementById('share-toggle-btn');
    const shareMenu = document.getElementById('share-menu');
    const copyBtn = document.getElementById('copy-link-btn');

    // 1. Ouvrir / Fermer le menu
    if (shareBtn && shareMenu) {
        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Empêche la fermeture immédiate
            shareMenu.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!shareMenu.contains(e.target) && e.target !== shareBtn) {
                shareMenu.classList.remove('show');
            }
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                if(shareMenu) shareMenu.classList.remove('show');

                const Toast = Swal.mixin({
                    toast: true, position: 'top-end', showConfirmButton: false, timer: 2000
                });
                Toast.fire({ icon: 'success', title: 'Lien copié !' });
            }).catch(err => console.error('Erreur copie:', err));
        });
    }
});