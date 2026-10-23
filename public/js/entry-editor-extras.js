// Compléments de l'éditeur d'articles (création et modification) :
//  1. image de couverture : envoi d'un fichier ou adresse, aperçu, retrait ;
//  2. brouillon local : le travail en cours est gardé dans le navigateur et peut être restauré après une fermeture accidentelle ;
//  3. alerte si on quitte la page avec des modifications non enregistrées ;
//  4. bouton « Retraduire tout depuis le français ».
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('entry-form');
    if (!form) return;

    const $ = (id) => document.getElementById(id);
    const editor = window.easyMDEInstance || null;

    let dirty = false;        // modifications non enregistrées
    let submitting = false;   // le formulaire est en train d'être envoyé

    // Message à l'utilisateur : SweetAlert2 s'il est chargé, sinon alert() du navigateur
    function notify(icon, title, text) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon, title, text, confirmButtonColor: 'var(--c-primary)' });
        } else {
            alert(`${title}\n${text}`);
        }
    }
    async function confirmAction(title, text, confirmText) {
        if (typeof Swal !== 'undefined') {
            const result = await Swal.fire({ icon: 'question', title, text, showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: 'Annuler', confirmButtonColor: 'var(--c-primary)' });
            return result.isConfirmed;
        }
        return window.confirm(`${title}\n${text}`);
    }

    // ------------------------------------------------------------------
    // 1. IMAGE DE COUVERTURE
    // ------------------------------------------------------------------
    const coverUrl = $('cover_image_url');
    const coverUploadBtn = $('cover-upload-btn');
    const coverFileInput = $('cover-upload-input');
    const coverRemoveBtn = $('cover-remove-btn');
    const coverPreview = $('cover-preview');

    function refreshCover() {
        if (!coverUrl || !coverPreview) return;
        const value = coverUrl.value.trim();
        const looksValid = /^(\/(?!\/)|https?:\/\/)/.test(value);
        if (value && looksValid) {
            coverPreview.src = value;
            coverPreview.hidden = false;
        } else {
            coverPreview.hidden = true;
            coverPreview.removeAttribute('src');
        }
        if (coverRemoveBtn) coverRemoveBtn.hidden = !value;
    }

    if (coverUrl) {
        refreshCover();
        coverUrl.addEventListener('input', refreshCover);
        if (coverPreview) {
            coverPreview.addEventListener('error', () => { coverPreview.hidden = true; });
        }
    }
    if (coverUploadBtn && coverFileInput) {
        coverUploadBtn.addEventListener('click', () => coverFileInput.click());

        coverFileInput.addEventListener('change', async () => {
            const file = coverFileInput.files[0];
            if (!file) return;

            if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
                notify('warning', 'Format non pris en charge', 'Choisissez une image JPEG, PNG, WebP ou GIF.');
                coverFileInput.value = '';
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                notify('warning', 'Image trop lourde', 'La taille maximale est de 5 Mo.');
                coverFileInput.value = '';
                return;
            }

            const originalLabel = coverUploadBtn.innerHTML;
            coverUploadBtn.disabled = true;
            coverUploadBtn.textContent = 'Envoi en cours…';

            try {
                const formData = new FormData();
                formData.append('image', file);
                const response = await fetch('/upload-image', { method: 'POST', body: formData, credentials: 'include' });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.imageUrl) throw new Error(data.error || "Réponse invalide du serveur");

                coverUrl.value = data.imageUrl;
                refreshCover();
                dirty = true;
                scheduleDraftSave();
            } catch (error) {
                console.error("Erreur d'envoi de la couverture :", error);
                notify('error', "L'envoi a échoué", error.message || 'Erreur inconnue');
            } finally {
                coverUploadBtn.disabled = false;
                coverUploadBtn.innerHTML = originalLabel;
                coverFileInput.value = '';
            }
        });
    }
    if (coverRemoveBtn && coverUrl) {
        coverRemoveBtn.addEventListener('click', () => {
            coverUrl.value = '';
            refreshCover();
            dirty = true;
            scheduleDraftSave();
        });
    }

    // ------------------------------------------------------------------
    // 2. BROUILLON LOCAL (localStorage)
    // ------------------------------------------------------------------
    const DRAFT_KEY = 'carnet:draft:' + (form.dataset.draftKey || 'new');
    const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    const TEXT_FIELDS = ['title_fr', 'title_en', 'summary_fr', 'summary_en', 'cover_image_url'];

    const storage = {
        read() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) { return null; } },
        write(value) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(value)); } catch (e) { /* stockage plein ou bloqué */ } },
        clear() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignoré */ } }
    };

    function snapshot() {
        const data = { fields: {}, tags: [] };
        TEXT_FIELDS.forEach((name) => { const input = form.elements[name]; data.fields[name] = input ? input.value : ''; });
        ['lat', 'lng'].forEach((name) => { const input = form.elements[name]; data.fields[name] = input ? input.value : ''; });
        data.content_fr = editor ? editor.value() : ((form.elements.content_fr || {}).value || '');
        data.content_en = (form.elements.content_en || {}).value || '';
        form.querySelectorAll('input[name="tags"]:checked').forEach((box) => data.tags.push(box.value));
        return data;
    }
    const signature = (data) => JSON.stringify([data.fields, data.content_fr, data.content_en, data.tags]);

    let initialSignature = null;
    let saveTimer;

    function scheduleDraftSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (!dirty || submitting) return;
            const data = snapshot();
            if (signature(data) === initialSignature) return; // rien de changé par rapport à l'article enregistré
            data.savedAt = Date.now();
            data.touched = window.enState ? { ...window.enState.touched } : null;
            storage.write(data);
        }, 1500);
    }

    function applyDraft(draft) {
        TEXT_FIELDS.concat(['lat', 'lng']).forEach((name) => {
            const input = form.elements[name];
            if (input && draft.fields && typeof draft.fields[name] === 'string') input.value = draft.fields[name];
        });
        // L'état « anglais corrigé à la main » doit être rétabli AVANT de remplir l'éditeur, sinon une traduction
        // automatique risquerait d'écraser l'anglais restauré.
        if (window.enState) {
            window.enState.touched.title = true;
            window.enState.touched.content = true;
        }
        const contentEn = form.elements.content_en;
        if (contentEn && typeof draft.content_en === 'string') contentEn.value = draft.content_en;
        if (editor && typeof draft.content_fr === 'string') editor.value(draft.content_fr);
        else if (form.elements.content_fr) form.elements.content_fr.value = draft.content_fr || '';

        form.querySelectorAll('input[name="tags"]').forEach((box) => { box.checked = (draft.tags || []).includes(box.value); });

        if (typeof window.renderEnglishPreview === 'function' && contentEn) window.renderEnglishPreview(contentEn.value);
        if (window.enState && draft.touched) {
            window.enState.touched.title = !!draft.touched.title;
            window.enState.touched.content = !!draft.touched.content;
        }
        refreshCover();
        dirty = true;
    }

    function showDraftBanner(draft) {
        const banner = $('local-draft-banner');
        if (!banner) return;

        const when = new Date(draft.savedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        banner.textContent = '';

        const icon = document.createElement('i');
        icon.className = 'fas fa-history';
        icon.setAttribute('aria-hidden', 'true');
        const message = document.createElement('span');
        message.textContent = ` Un brouillon enregistré automatiquement sur cet ordinateur (${when}) a été retrouvé.`;

        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'btn';
        restoreBtn.textContent = 'Restaurer';
        restoreBtn.addEventListener('click', () => { applyDraft(draft); banner.hidden = true; });

        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'btn btn-secondary';
        dismissBtn.textContent = 'Ignorer';
        dismissBtn.addEventListener('click', () => { storage.clear(); banner.hidden = true; });

        banner.append(icon, message, restoreBtn, dismissBtn);
        banner.hidden = false;
    }

    // On attend que l'éditeur ait fini de se synchroniser (titre -> contenu...) avant de prendre la photo de départ.
    setTimeout(() => {
        initialSignature = signature(snapshot());

        const saved = storage.read();
        if (!saved || !saved.savedAt) return;
        if (Date.now() - saved.savedAt > DRAFT_MAX_AGE_MS) { storage.clear(); return; }
        if (signature(saved) === initialSignature) { storage.clear(); return; } // identique à l'article enregistré
        showDraftBanner(saved);
    }, 900);

    // ------------------------------------------------------------------
    // 3. SUIVI DES MODIFICATIONS + ALERTE DE SORTIE
    // ------------------------------------------------------------------
    form.addEventListener('input', () => { dirty = true; scheduleDraftSave(); });
    form.addEventListener('change', () => { dirty = true; scheduleDraftSave(); });
    if (editor) {
        // "setValue" = remplissage par programme (synchro titre, restauration) : ce n'est pas une frappe
        editor.codemirror.on('change', (cm, change) => {
            if (change.origin === 'setValue') return;
            dirty = true;
            scheduleDraftSave();
        });
    }
    document.addEventListener('entry:english-updated', () => { if (dirty) scheduleDraftSave(); });

    function markSubmitting() {
        submitting = true;
        clearTimeout(saveTimer);
        storage.clear(); // l'article est enregistré par le serveur : le brouillon local ne sert plus
    }
    form.addEventListener('submit', markSubmitting);
    document.addEventListener('entry:submitting', markSubmitting);

    window.addEventListener('beforeunload', (event) => {
        if (dirty && !submitting) {
            event.preventDefault();
            event.returnValue = ''; // affiche la confirmation standard du navigateur
        }
    });

    // ------------------------------------------------------------------
    // 4. RETRADUIRE TOUT DEPUIS LE FRANÇAIS
    // ------------------------------------------------------------------
    const retranslateBtn = $('retranslate-btn');
    if (retranslateBtn) {
        retranslateBtn.addEventListener('click', async () => {
            const state = window.enState;
            if (!state || typeof window.translateText !== 'function') return;

            const title = (form.elements.title_fr || {}).value || '';
            const content = editor ? editor.value() : ((form.elements.content_fr || {}).value || '');
            if (!title.trim() && !content.trim()) {
                notify('info', 'Rien à traduire', "Écrivez d'abord le titre ou le contenu en français.");
                return;
            }

            if (state.touched.title || state.touched.content) {
                const ok = await confirmAction(
                    "Remplacer l'anglais ?",
                    "Vos corrections de la version anglaise seront remplacées par une nouvelle traduction automatique.",
                    'Retraduire'
                );
                if (!ok) return;
            }

            state.touched.title = false;
            state.touched.content = false;
            state.available = true; // on retente même si une erreur précédente avait désactivé la traduction
            dirty = true;
            if (title.trim()) window.translateText(title, 'en-GB', 'title', { force: true });
            if (content.trim()) window.translateText(content, 'en-GB', 'content', { force: true });
        });
    }
});
