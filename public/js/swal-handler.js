document.addEventListener('DOMContentLoaded', () => {

    const clearFlashServerSide = () => {
        fetch('/api/clear-flash', { method: 'POST' })
            .catch(err => console.error("Erreur nettoyage flash:", err));
    };

    const flashElement = document.getElementById('flash-message-data');

    if (flashElement) {
        const type = flashElement.getAttribute('data-type') || 'info'; // info par défaut
        const text = flashElement.textContent.trim();
        const detail = flashElement.getAttribute('data-detail');

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

        Toast.fire({
            icon: type,
            title: text,
            text: detail || ''
        });

        flashElement.remove();
        clearFlashServerSide();
    }

    const linksToConfirm = document.querySelectorAll('a[data-confirm], button[data-confirm], form[data-confirm]');

    linksToConfirm.forEach(element => {
        element.addEventListener('click', function(e) {
            const msg = this.getAttribute('data-confirm');
            if (!msg) return;

            if (this.tagName === 'FORM' || this.type === 'submit') {
                e.preventDefault();
                const form = this.closest('form') || this;

                Swal.fire({
                    title: 'Êtes-vous sûr ?',
                    text: msg,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    confirmButtonText: 'Oui, confirmer',
                    cancelButtonText: 'Annuler'
                }).then((result) => {
                    if (result.isConfirmed) form.submit();
                });
            }

            else if (this.tagName === 'A') {
                e.preventDefault();
                const href = this.href;

                Swal.fire({
                    title: 'Confirmation',
                    text: msg,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Oui',
                    cancelButtonText: 'Non'
                }).then((result) => {
                    if (result.isConfirmed) window.location.href = href;
                });
            }
        });
    });
});