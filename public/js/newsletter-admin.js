document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('newsletter-form');
    
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault(); // 1. Bloquer l'envoi

            // 2. Afficher SweetAlert
            Swal.fire({
                title: 'Confirmer l\'envoi ?',
                text: "Vous allez envoyer cet email à tous vos abonnés.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: 'var(--c-primary)',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Oui, envoyer !',
                cancelButtonText: 'Annuler'
            }).then((result) => {
                if (result.isConfirmed) {
                    // 3. Loading et Envoi
                    Swal.fire({
                        title: 'Envoi en cours...',
                        text: 'Veuillez patienter.',
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });
                    form.submit();
                }
            });
        });
    }
});