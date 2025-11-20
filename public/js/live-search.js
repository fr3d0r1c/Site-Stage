document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('query');
    const resultsContainer = document.querySelector('.entries-grid');
    const loader = document.getElementById('search-loader'); // Récupère le loader

    if (!searchInput || !resultsContainer || !loader) return;

    let debounceTimer;

    searchInput.addEventListener('input', function() {
        const query = this.value.trim();

        clearTimeout(debounceTimer);

        // Si le champ est vidé, on ne fait rien (ou on pourrait recharger la page)
        if (query.length === 0) return;

        debounceTimer = setTimeout(() => {
            if (query.length < 2) return;

            // 1. AFFICHER LE LOADER / CACHER LES RÉSULTATS (optionnel)
            loader.style.display = 'flex';
            resultsContainer.style.opacity = '0.3'; // On grise les anciens résultats

            console.log("Recherche live pour :", query);

            fetch(`/api/search?q=${encodeURIComponent(query)}`)
                .then(response => response.json())
                .then(data => {
                    // 2. CACHER LE LOADER
                    loader.style.display = 'none';
                    resultsContainer.style.opacity = '1'; // On rétablit l'opacité

                    updateResults(data);
                })
                .catch(err => {
                    console.error("Erreur recherche live:", err);
                    loader.style.display = 'none'; // Cacher le loader même en cas d'erreur
                    resultsContainer.style.opacity = '1';
                });
        }, 300);
    });

    function updateResults(articles) {
        resultsContainer.innerHTML = '';

        if (articles.length === 0) {
            resultsContainer.innerHTML = '<p style="width:100%; text-align:center;">Aucun résultat trouvé.</p>';
            return;
        }

        articles.forEach(entry => {
            // Logique image
            let imageHtml = '';
            if (entry.image) {
                imageHtml = `
                    <a href="/entree/${entry.id}" class="card-image-link">
                        <img src="${entry.image}" alt="${entry.title}" class="cover-image">
                    </a>`;
            }

            const cardHtml = `
                <article class="entry-card">
                    ${imageHtml}
                    <div class="card-body">
                        <h2><a href="/entree/${entry.id}">${entry.title}</a></h2>
                        <small>Publié le: ${entry.date}</small>
                        <p>${entry.excerpt} <a href="/entree/${entry.id}">Lire la suite</a></p>
                    </div>
                </article>
            `;
            resultsContainer.insertAdjacentHTML('beforeend', cardHtml);
        });
    }
});