const zenBtn = document.getElementById('zen-mode-btn');

if (zenBtn) {
    zenBtn.addEventListener('click', () => {
        document.body.classList.toggle('zen-mode');
        const icon = zenBtn.querySelector('i');
        if (document.body.classList.contains('zen-mode')) {
            icon.classList.remove('fa-book-open');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-book-open');
        }
    });
}