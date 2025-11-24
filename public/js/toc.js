document.addEventListener('DOMContentLoaded', () => {
    const articleContent = document.querySelector('.article-content');
    const tocContainer = document.getElementById('table-of-contents');

    if (!articleContent || !tocContainer) return;

    // 1. Trouver tous les titres H2 et H3 dans l'article
    const headers = articleContent.querySelectorAll('h2, h3');

    // S'il n'y a pas assez de titres (moins de 2), pas besoin de sommaire
    if (headers.length < 2) {
        tocContainer.style.display = 'none';
        return;
    }

    // 2. Construire le HTML du sommaire
    let tocHtml = '<div class="toc-title">📑 Sommaire</div><ul>';
    
    headers.forEach((header, index) => {
        // Créer un ID unique pour l'ancre si le titre n'en a pas
        if (!header.id) {
            // Ex: "Mon Titre" -> "mon-titre"
            const slug = header.textContent.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
            header.id = slug || `section-${index}`;
        }

        // Déterminer la classe selon le niveau (h2 ou h3) pour l'indentation
        const className = header.tagName.toLowerCase() === 'h3' ? 'toc-subitem' : 'toc-item';

        tocHtml += `<li class="${className}"><a href="#${header.id}">${header.textContent}</a></li>`;
    });

    tocHtml += '</ul>';

    // 3. Injecter le sommaire
    tocContainer.innerHTML = tocHtml;
    
    // Ajout du scroll fluide pour ces liens
    tocContainer.querySelectorAll('a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});