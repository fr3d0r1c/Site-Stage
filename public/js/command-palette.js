document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('cmd-overlay');
    const input = document.getElementById('cmd-input');
    const list = document.getElementById('cmd-list');
    const isAdmin = document.body.dataset.isAdmin === 'true';
    let selectedIndex = 0;
    let filteredCommands = [];

    // --- 1. DÉFINITION DES COMMANDES ---
    const commands = [
        // Navigation
        { title: 'Aller à l\'Accueil', icon: 'fa-home', action: () => window.location.href = '/' },
        { title: 'Voir le Journal', icon: 'fa-book-open', action: () => window.location.href = '/journal' },
        { title: 'Chronologie', icon: 'fa-history', action: () => window.location.href = '/chronologie' },
        { title: 'Recherche', icon: 'fa-search', action: () => window.location.href = '/search' },
        { title: 'Contact', icon: 'fa-envelope', action: () => window.location.href = '/contact' },
        
        // Thèmes (Action immédiate via le bouton existant)
        { title: 'Thème : Clair', icon: 'fa-sun', action: () => clickTheme('light') },
        { title: 'Thème : Sombre', icon: 'fa-moon', action: () => clickTheme('dark') },
        { title: 'Thème : Sépia', icon: 'fa-coffee', action: () => clickTheme('sepia') },

        // Admin (Conditionnel)
        ...(isAdmin ? [
            { title: 'Admin : Dashboard', icon: 'fa-chart-line', type: 'Admin', action: () => window.location.href = '/admin/dashboard' },
            { title: 'Admin : Écrire un article', icon: 'fa-pen-nib', type: 'Admin', action: () => window.location.href = '/journal/nouvelle' },
            { title: 'Admin : Gérer les Tags', icon: 'fa-tags', type: 'Admin', action: () => window.location.href = '/admin/tags' },
            { title: 'Admin : Déconnexion', icon: 'fa-sign-out-alt', type: 'Admin', action: () => window.location.href = '/deconnexion' },
        ] : [
            { title: 'Admin : Connexion', icon: 'fa-lock', action: () => window.location.href = '/connexion' }
        ])
    ];

    // Helper pour cliquer sur les boutons de thème cachés
    function clickTheme(theme) {
        const btn = document.querySelector(`button[data-theme="${theme}"]`);
        if (btn) btn.click();
        closePalette();
    }

    // --- 2. FONCTIONS D'AFFICHAGE ---
    function openPalette() {
        overlay.classList.add('active');
        input.value = '';
        input.focus();
        renderList(commands);
    }

    function closePalette() {
        overlay.classList.remove('active');
    }

    function renderList(cmds) {
        filteredCommands = cmds;
        selectedIndex = 0;
        list.innerHTML = '';

        if (cmds.length === 0) {
            list.innerHTML = '<li style="padding:15px; text-align:center; color:#888;">Aucune commande trouvée</li>';
            return;
        }

        cmds.forEach((cmd, index) => {
            const li = document.createElement('li');
            li.className = `cmd-item ${index === 0 ? 'selected' : ''}`;
            li.innerHTML = `
                <i class="fas ${cmd.icon}"></i>
                <span>${cmd.title}</span>
                ${cmd.type ? `<small>${cmd.type}</small>` : ''}
            `;
            
            // Clic souris
            li.addEventListener('click', () => {
                cmd.action();
                closePalette();
            });
            
            list.appendChild(li);
        });
    }

    // --- 3. ÉVÉNEMENTS ---
    
    // Raccourci Clavier (Ctrl+K ou Cmd+K)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault(); // Empêche le comportement navigateur
            if (overlay.classList.contains('active')) closePalette();
            else openPalette();
        }
        
        // Fermer avec ESC
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            closePalette();
        }
    });

    // Navigation dans la liste (Haut/Bas/Entrée)
    input.addEventListener('keydown', (e) => {
        const items = list.querySelectorAll('.cmd-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            selectedIndex = (selectedIndex + 1) % items.length;
            updateSelection(items);
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            updateSelection(items);
            e.preventDefault();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            filteredCommands[selectedIndex].action();
            closePalette();
        }
    });

    // Filtrage en temps réel
    input.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = commands.filter(c => c.title.toLowerCase().includes(term));
        renderList(filtered);
    });

    function updateSelection(items) {
        items.forEach(i => i.classList.remove('selected'));
        items[selectedIndex].classList.add('selected');
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }

    // Fermer au clic dehors
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePalette();
    });
});