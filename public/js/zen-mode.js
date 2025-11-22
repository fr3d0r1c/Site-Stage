document.addEventListener('DOMContentLoaded', () => {
    const zenBtn = document.getElementById('zen-mode-btn');
    
    if (zenBtn) {
        zenBtn.addEventListener('click', () => {
            // Bascule la classe sur le body
            document.body.classList.toggle('zen-mode');
            
            // Change l'icône (Livre <-> Croix)
            const icon = zenBtn.querySelector('i');
            if (document.body.classList.contains('zen-mode')) {
                icon.classList.remove('fa-book-open');
                icon.classList.add('fa-times');
                zenBtn.title = "Quitter le mode Zen";
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-book-open');
                zenBtn.title = "Mode Lecture Zen";
            }
        });
    }
});