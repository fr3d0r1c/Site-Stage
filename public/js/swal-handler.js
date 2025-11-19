document.addEventListener('DOMContentLoaded', () => {

    // --- PARTIE 1 : NOTIFICATIONS "TOAST" AVEC DÉTAILS ---
    
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 4000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    const successMessageElement = document.querySelector('.feedback-message.success');
    const errorMessageElement = document.querySelector('.error-message');

    function showSmartToast(element, iconType) {
        if (!element) return;

        const text = element.textContent || element.innerText;
        const detail = element.getAttribute('data-detail'); // Récupère le détail technique

        // Configuration de base du toast
        let toastConfig = {
            icon: iconType,
            title: text
        };

        // Si on a des détails techniques (ex: erreur SQL)
        if (detail && detail !== '') {
            toastConfig.title = text + ' (Cliquez pour détails)';
            toastConfig.didOpen = (toast) => {
                // Change le curseur pour montrer que c'est cliquable
                toast.style.cursor = 'pointer';
                // Ajoute l'événement de clic
                toast.addEventListener('click', () => {
                    Swal.fire({
                        title: 'Détails de l\'erreur',
                        text: detail,
                        icon: 'info',
                        confirmButtonText: 'Fermer',
                        confirmButtonColor: 'var(--c-primary)'
                    });
                });
                // Arrête le timer au survol
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            };
        }

        Toast.fire(toastConfig);
        element.remove();
    }

    // Affiche les toasts
    showSmartToast(successMessageElement, 'success');
    showSmartToast(errorMessageElement, 'error');


    // --- PARTIE 2 : CONFIRMATIONS (Inchangé) ---
    // (Garde le reste de ton code pour les formulaires et liens ici...)
    const formsToConfirm = document.querySelectorAll('form[data-confirm]');
    // ... (le reste du fichier reste identique à la version précédente) ...
    formsToConfirm.forEach(form => {
        const message = form.getAttribute('data-confirm');
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            Swal.fire({
                title: message,
                text: "Cette action est irréversible !",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Oui, continuer !',
                cancelButtonText: 'Annuler'
            }).then((result) => {
                if (result.isConfirmed) form.submit();
            });
        });
    });

    const linksToConfirm = document.querySelectorAll('a[data-confirm]');
    linksToConfirm.forEach(link => {
        const message = link.getAttribute('data-confirm');
        const href = link.href;
        link.addEventListener('click', function(event) {
            event.preventDefault();
            Swal.fire({
                title: message,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Oui',
                cancelButtonText: 'Non'
            }).then((result) => {
                if (result.isConfirmed) window.location.href = href;
            });
        });
    });
});