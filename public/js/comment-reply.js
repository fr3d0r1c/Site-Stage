document.addEventListener('DOMContentLoaded', () => {
    const replyBtns = document.querySelectorAll('.reply-btn');
    const parentInput = document.getElementById('parent_id_input');
    const replyIndicator = document.getElementById('reply-indicator');
    const replyAuthor = document.getElementById('reply-author');
    const cancelReplyBtn = document.getElementById('cancel-reply');
    const formTitle = document.getElementById('form-title');
    const commentForm = document.querySelector('.comment-form');

    // Gestion du clic sur "Répondre"
    replyBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // Empêche le saut de page par défaut
            
            const commentId = btn.getAttribute('data-id');
            const author = btn.getAttribute('data-author');

            // 1. Remplir l'ID du parent dans le champ caché
            if (parentInput) parentInput.value = commentId;
            
            // 2. Afficher la zone "Réponse à..."
            if (replyIndicator) {
                replyIndicator.style.display = 'block';
                if (replyAuthor) replyAuthor.textContent = author;
            }
            
            // 3. Changer le titre du formulaire
            if (formTitle) formTitle.textContent = "Laisser une réponse";

            // 4. Scroller vers le formulaire en douceur
            if (commentForm) {
                commentForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Mettre le focus dans la zone de texte
                const textarea = commentForm.querySelector('textarea');
                if (textarea) textarea.focus();
            }
        });
    });

    // Gestion du clic sur "Annuler la réponse"
    if (cancelReplyBtn) {
        cancelReplyBtn.addEventListener('click', () => {
            // Reset du champ caché
            if (parentInput) parentInput.value = '';
            
            // Cacher l'indicateur
            if (replyIndicator) replyIndicator.style.display = 'none';
            
            // Remettre le titre d'origine (approximatif)
            if (formTitle) formTitle.textContent = "Laisser un commentaire";
        });
    }
});