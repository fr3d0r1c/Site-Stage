document.addEventListener('DOMContentLoaded', () => {
    // Éléments de la lightbox
    const modal = document.getElementById('lightbox-overlay');
    const modalImg = document.getElementById('lightbox-image');
    const captionText = document.getElementById('lightbox-caption');
    const closeBtn = document.querySelector('.lightbox-close');

    // 1. Sélectionner toutes les images DANS les articles
    // (On évite de sélectionner le logo ou les icônes)
    const images = document.querySelectorAll('.article-content img');

    if (modal && modalImg && images.length > 0) {
        
        // 2. Ajouter l'événement clic sur chaque image
        images.forEach(img => {
            img.addEventListener('click', function() {
                modal.style.display = "flex"; // Affiche la boîte
                modalImg.src = this.src;      // Récupère l'URL de l'image cliquée
                
                // Si l'image a un texte alternatif (alt), on l'affiche en légende
                if (this.alt) {
                    captionText.innerHTML = this.alt;
                } else {
                    captionText.innerHTML = "";
                }
            });
        });

        // 3. Fonction pour fermer
        function closeLightbox() {
            modal.style.display = "none";
        }

        // Fermer au clic sur la croix
        if (closeBtn) {
            closeBtn.addEventListener('click', closeLightbox);
        }

        // Fermer au clic sur le fond noir (en dehors de l'image)
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeLightbox();
            }
        });
        
        // Fermer avec la touche Echap
        document.addEventListener('keydown', function(e) {
            if (e.key === "Escape" && modal.style.display === "flex") {
                closeLightbox();
            }
        });
    }
});