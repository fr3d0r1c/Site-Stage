document.addEventListener('DOMContentLoaded', () => {

    // --- PARTIE 1 : GESTION DES NOTIFICATIONS "TOAST" ---

    // Mixin pour un design de toast cohérent
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    // Cherche les messages de feedback que le serveur a rendus
    const successMessageElement = document.querySelector('.feedback-message.success');
    const errorMessageElement = document.querySelector('.error-message');

    if (successMessageElement) {
        const text = successMessageElement.textContent || successMessageElement.innerText;
        Toast.fire({
            icon: 'success',
            title: text
        });
        successMessageElement.remove(); // Supprime le message HTML
    }

    if (errorMessageElement) {
        const text = errorMessageElement.textContent || errorMessageElement.innerText;
        Toast.fire({
            icon: 'error',
            title: text
        });
        errorMessageElement.remove(); // Supprime le message HTML
    }

    // --- PARTIE 2 : GESTION DES POP-UPS DE CONFIRMATION ---

    // Gère les formulaires (ex: Supprimer)
    const formsToConfirm = document.querySelectorAll('form[onsubmit*="confirm"]');
    formsToConfirm.forEach(form => {
        const onsubmitAttr = form.getAttribute('onsubmit');
        const messageMatch = onsubmitAttr.match(/confirm\('([^']*)'\)/i);
        const message = (messageMatch && messageMatch[1]) ? messageMatch[1] : 'Êtes-vous sûr ?';

        form.removeAttribute('onsubmit'); // Supprime l'attribut inline

        form.addEventListener('submit', function(event) {
            event.preventDefault(); // Empêche l'envoi immédiat du formulaire

            Swal.fire({
                title: message,
                text: "Cette action est irréversible !",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: 'var(--c-danger)', // Utilise la couleur de ton thème
                cancelButtonColor: 'var(--c-gray)',
                confirmButtonText: 'Oui, supprimer !',
                cancelButtonText: 'Annuler'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Si l'utilisateur confirme, on soumet le formulaire
                    form.submit();
                }
            });
        });
    });

    // Gère les liens (ex: Déconnexion)
    const linksToConfirm = document.querySelectorAll('a[onclick*="confirm"]');
    linksToConfirm.forEach(link => {
        const onclickAttr = link.getAttribute('onclick');
        const messageMatch = onclickAttr.match(/confirm\('([^']*)'\)/i);
        const message = (messageMatch && messageMatch[1]) ? messageMatch[1] : 'Êtes-vous sûr ?';
        const href = link.href;

        link.removeAttribute('onclick'); // Supprime l'attribut inline
        link.removeAttribute('href'); // Empêche la navigation
        link.style.cursor = 'pointer'; // Garde le curseur main

        link.addEventListener('click', function(event) {
            event.preventDefault(); // Empêche la navigation

            Swal.fire({
                title: message,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: 'var(--c-primary)',
                cancelButtonColor: 'var(--c-gray)',
                confirmButtonText: 'Oui',
                cancelButtonText: 'Non'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Si l'utilisateur confirme, on navigue vers le lien
                    window.location.href = href;
                }
            });
        });
    });
});