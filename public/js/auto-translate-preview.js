// Traduction automatique FR -> EN dans l'éditeur d'articles.
//
// Règles (par rapport à l'ancienne version) :
//  - un champ anglais corrigé à la main n'est JAMAIS écrasé (sauf bouton « Retraduire tout ») ;
//  - en cas d'erreur, le champ anglais n'est pas modifié (avant : « Translation Error. » y était écrit
//    et pouvait être enregistré avec l'article) ;
//  - ouvrir un article existant ne relance pas de traduction si l'anglais est déjà rempli ;
//  - une réponse tardive d'une ancienne requête ne remplace pas une plus récente.
(function () {
    const state = {
        touched: { title: false, content: false }, // true = l'utilisateur a écrit/corrigé l'anglais lui-même
        seq: { title: 0, content: 0 },             // numéro de la dernière requête, pour ignorer les réponses périmées
        lastSource: { title: null, content: null },// dernier texte français envoyé (évite de retraduire à l'identique)
        available: true                            // passe à false si le serveur n'a pas de clé DeepL
    };
    window.enState = state;

    const el = (id) => document.getElementById(id);

    function setStatus(type, message, isError) {
        const status = el(type === 'title' ? 'title-en-status' : 'content-en-status');
        if (!status) return;
        status.textContent = message || '';
        status.classList.toggle('is-error', !!isError);
    }

    function renderEnglishPreview(markdown) {
        const preview = el('preview_en');
        if (!preview) return;
        if (typeof marked === 'undefined') { preview.textContent = markdown; return; }

        const clean = String(markdown || '').replace(/^#\s+.*(\r\n|\n|\r)?/, '').trim();
        preview.innerHTML = marked.parse(clean);
        if (typeof hljs !== 'undefined') {
            preview.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
            if (typeof addCopyButtons === 'function') addCopyButtons();
        }
    }
    window.renderEnglishPreview = renderEnglishPreview;

    // Les blocs de code ne doivent pas être traduits : on les remplace par des repères le temps de l'appel.
    function protectCodeBlocks(text) {
        const blocks = [];
        const protectedText = text.replace(/```[\s\S]*?```/g, (match) => {
            blocks.push(match);
            return `__CODE_BLOCK_${blocks.length - 1}__`;
        });
        return { protectedText, restore: (translated) => blocks.reduce((out, block, i) => out.replace(new RegExp(`__CODE_BLOCK_${i}__`, 'g'), () => block), translated) };
    }

    /**
     * Traduit `text` (français) vers l'anglais et remplit le champ correspondant.
     * type : 'title' ou 'content'. opts.force : traduit même si l'anglais a été corrigé à la main.
     */
    window.translateText = async function (text, targetLang = 'en-GB', type = 'content', opts = {}) {
        const force = !!opts.force;
        if (!text || !text.trim()) return;
        if (!force && (state.touched[type] || !state.available)) return;
        if (!force && state.lastSource[type] === text) return;

        const titleEn = el('title_en');
        const contentEn = el('content_en');
        if ((type === 'title' && !titleEn) || (type !== 'title' && !contentEn)) return;

        const mySeq = ++state.seq[type];
        setStatus(type, 'Traduction en cours…', false);

        try {
            const { protectedText, restore } = type === 'content' ? protectCodeBlocks(text) : { protectedText: text, restore: (t) => t };

            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: protectedText, targetLang }),
                credentials: 'include'
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const error = new Error(data.error || response.statusText);
                error.status = response.status;
                throw error;
            }
            if (typeof data.translatedText !== 'string') throw new Error('Réponse inattendue.');

            if (mySeq !== state.seq[type]) return; // une requête plus récente est partie entre-temps

            const translated = restore(data.translatedText);
            state.lastSource[type] = text;

            if (type === 'title') {
                titleEn.value = translated;
            } else {
                contentEn.value = translated;
                renderEnglishPreview(translated);
            }
            setStatus(type, 'Traduit automatiquement', false);
            document.dispatchEvent(new CustomEvent('entry:english-updated', { detail: { type } }));

        } catch (error) {
            console.error(`Erreur durant la traduction (${type}):`, error);
            if (mySeq !== state.seq[type]) return;

            if (error.status === 503) {
                state.available = false;
                setStatus(type, "Traduction automatique indisponible : écrivez l'anglais à la main (sinon il sera recopié du français).", true);
            } else {
                setStatus(type, "La traduction a échoué : l'anglais n'a pas été modifié.", true);
            }
            // On ne touche PAS au champ anglais : il garde sa valeur précédente.
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const titleFr = el('title_fr');
        const titleEn = el('title_en');
        const contentEn = el('content_en');
        const previewEn = el('preview_en');

        // Un anglais déjà présent (article existant) est considéré comme relu : on ne l'écrase pas.
        if (titleEn && titleEn.value.trim()) state.touched.title = true;
        if (contentEn && contentEn.value.trim()) {
            state.touched.content = true;
            renderEnglishPreview(contentEn.value);
        } else if (previewEn) {
            previewEn.textContent = '';
        }

        // L'utilisateur écrit lui-même dans un champ anglais (event.isTrusted : vraie frappe, pas du code)
        if (titleEn) {
            titleEn.addEventListener('input', (event) => {
                if (!event.isTrusted) return;
                state.touched.title = true;
                setStatus('title', 'Modifié à la main : ne sera plus traduit automatiquement.', false);
            });
        }
        if (contentEn) {
            contentEn.addEventListener('input', (event) => {
                if (!event.isTrusted) return;
                state.touched.content = true;
                setStatus('content', 'Modifié à la main : ne sera plus traduit automatiquement.', false);
                renderEnglishPreview(contentEn.value);
            });
        }

        // Titre français -> titre anglais (avec un petit délai pour ne pas traduire à chaque lettre)
        let titleTimer;
        if (titleFr) {
            titleFr.addEventListener('input', () => {
                clearTimeout(titleTimer);
                const text = titleFr.value;
                if (!text.trim()) return;
                titleTimer = setTimeout(() => window.translateText(text, 'en-GB', 'title'), 900);
            });
        }

        // Page de modification d'un article dont l'anglais est vide : on le traduit une fois à l'ouverture.
        setTimeout(() => {
            if (titleFr && titleFr.value.trim() && titleEn && !titleEn.value.trim()) {
                window.translateText(titleFr.value, 'en-GB', 'title');
            }
            const source = window.easyMDEInstance ? window.easyMDEInstance.value() : (el('content-editor-fr') || {}).value;
            if (source && source.trim() && contentEn && !contentEn.value.trim()) {
                window.translateText(source, 'en-GB', 'content');
            }
        }, 600);
    });
})();
