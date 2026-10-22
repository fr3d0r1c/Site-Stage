document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const query = (params.get('query') || '').trim();

    if (!query) return;

    // Surligne le terme dans les nœuds de TEXTE uniquement.
    // (Avant : le terme était injecté dans innerHTML comme expression régulière, ce qui plantait
    //  avec des caractères comme "(" et abîmait les balises/attributs contenant le mot cherché.)
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const highlightText = (rootElement, term) => {
        const regex = new RegExp(escapeRegex(term), 'gi'); // Insensible à la casse

        const targets = rootElement.querySelectorAll('.entry-card h2 a, .entry-card p, .article-content');

        targets.forEach(target => {
            const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            while (walker.nextNode()) textNodes.push(walker.currentNode);

            textNodes.forEach(node => {
                const text = node.nodeValue;
                regex.lastIndex = 0;
                if (!regex.test(text)) return;

                const fragment = document.createDocumentFragment();
                let last = 0;
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    if (match[0] === '') { regex.lastIndex++; continue; }
                    fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
                    const mark = document.createElement('mark');
                    mark.textContent = match[0];
                    fragment.appendChild(mark);
                    last = match.index + match[0].length;
                }
                fragment.appendChild(document.createTextNode(text.slice(last)));
                node.parentNode.replaceChild(fragment, node);
            });
        });
    };

    const resultsContainer = document.querySelector('.entries-grid') || document.querySelector('.article-content');
    if (resultsContainer) {
        highlightText(document.body, query);
    }
});
