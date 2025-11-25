// Initialisation de la PWA (Service Worker)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('✅ Service Worker enregistré ! Scope:', reg.scope))
            .catch(err => console.error('❌ Erreur Service Worker :', err));
    });
}