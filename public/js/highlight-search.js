document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('query');

    if (!query || query.trim() === '') return;

    const highlightText = (rootElement, term) => {
        const regex = new RegExp(`(${term})`, 'gi'); // Insensible à la casse

        const targets = rootElement.querySelectorAll('.entry-card h2 a, .entry-card p, .article-content');

        targets.forEach(target => {
            if (target.innerHTML.toLowerCase().includes(term.toLowerCase())) {
                target.innerHTML = target.innerHTML.replace(regex, '<mark>$1</mark>');
            }
        });
    };

    const resultsContainer = document.querySelector('.entries-grid') || document.querySelector('.article-content');
    if (resultsContainer) {
        highlightText(document.body, query);
    }
});