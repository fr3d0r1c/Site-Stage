document.addEventListener('DOMContentLoaded', () => {

    // --- PARTIE 1 : NOTIFICATIONS "TOAST" (Succès/Erreur) ---
    // (Cette partie ne change pas)
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

    if (successMessageElement) {
        const text = successMessageElement.textContent || successMessageElement.innerText;
        Toast.fire({ icon: 'success', title: text });
        successMessageElement.remove();
    }

    if (errorMessageElement) {
        const text = errorMessageElement.textContent || errorMessageElement.innerText;
        Toast.fire({ icon: 'error', title: text });
        errorMessageElement.remove();
    }

    // --- PARTIE 2 : CONFIRMATIONS (NOUVELLE MÉTHODE) ---

    // 1. Pour les formulaires (ex: Supprimer)
    // On cherche les formulaires qui ont l'attribut 'data-confirm'
    const formsToConfirm = document.querySelectorAll('form[data-confirm]');
    
    formsToConfirm.forEach(form => {
        const message = form.getAttribute('data-confirm'); // Plus simple !

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

    // 2. Pour les liens (ex: Déconnexion, Annuler)
    // On cherche les liens qui ont l'attribut 'data-confirm'
    const linksToConfirm = document.querySelectorAll('a[data-confirm]');
    
    linksToConfirm.forEach(link => {
        const message = link.getAttribute('data-confirm'); // Plus simple !
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