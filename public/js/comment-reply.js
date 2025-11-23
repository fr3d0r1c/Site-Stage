document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. GESTION DE L'ACCORDÉON PRINCIPAL (Tout afficher/Masquer)
    // ==========================================
    const toggleMainBtn = document.getElementById('toggle-all-comments');
    const mainContainer = document.getElementById('comments-main-container');
    
    if (toggleMainBtn && mainContainer) {
        toggleMainBtn.addEventListener('click', () => {
            const isClosed = mainContainer.style.display === 'none';
            
            if (isClosed) {
                mainContainer.style.display = 'block';
                toggleMainBtn.setAttribute('aria-expanded', 'true');
            } else {
                mainContainer.style.display = 'none';
                toggleMainBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }


    // ==========================================
    // 2. GESTION DES RÉPONSES (Bouton "Voir les réponses")
    // ==========================================
    const toggleRepliesBtns = document.querySelectorAll('.btn-toggle-replies');
    
    toggleRepliesBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const repliesDiv = document.getElementById(targetId);
            
            if (repliesDiv) {
                if (repliesDiv.style.display === 'none') {
                    // OUVRIR
                    repliesDiv.style.display = 'block';
                    btn.innerHTML = '<i class="fas fa-chevron-up"></i> Masquer les réponses';
                } else {
                    // FERMER
                    repliesDiv.style.display = 'none';
                    // On recompte les enfants pour remettre le bon chiffre
                    const count = repliesDiv.children.length; 
                    btn.innerHTML = `<i class="fas fa-level-down-alt"></i> Voir les ${count} réponses`;
                }
            }
        });
    });


    // ==========================================
    // 3. GESTION DU BOUTON "RÉPONDRE" (Formulaire)
    // ==========================================
    const replyBtns = document.querySelectorAll('.reply-btn');
    
    // Éléments du formulaire
    const parentInput = document.getElementById('parent_id_input');
    const replyIndicator = document.getElementById('reply-indicator');
    const replyAuthor = document.getElementById('reply-author');
    const cancelReplyBtn = document.getElementById('cancel-reply');
    const formTitle = document.getElementById('form-title');
    const commentFormBlock = document.querySelector('.comment-form');
    const commentTextarea = document.getElementById('comment_content');

    replyBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();

            const commentId = btn.getAttribute('data-id');
            const author = btn.getAttribute('data-author');

            // 1. Remplir l'ID du parent
            if (parentInput) parentInput.value = commentId;
            
            // 2. Afficher l'indicateur visuel
            if (replyIndicator) {
                replyIndicator.style.display = 'block';
                if (replyAuthor) replyAuthor.textContent = author;
            }
            
            // 3. Changer le titre
            if (formTitle) formTitle.textContent = "Laisser une réponse";

            // 4. Si la section principale est fermée, on l'ouvre pour montrer le formulaire
            if (mainContainer && mainContainer.style.display === 'none') {
                mainContainer.style.display = 'block';
                if (toggleMainBtn) toggleMainBtn.setAttribute('aria-expanded', 'true');
            }

            // 5. Scroller et Focus
            if (commentFormBlock) {
                commentFormBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (commentTextarea) commentTextarea.focus();
            }
        });
    });


    // ==========================================
    // 4. GESTION DU BOUTON "ANNULER LA RÉPONSE"
    // ==========================================
    if (cancelReplyBtn) {
        cancelReplyBtn.addEventListener('click', () => {
            // Reset
            if (parentInput) parentInput.value = '';
            if (replyIndicator) replyIndicator.style.display = 'none';
            // Remettre le titre
            if (formTitle) formTitle.textContent = "Laisser un commentaire"; // Texte par défaut (ou utiliser une data-attribute pour la trad exacte)
        });
    }
});