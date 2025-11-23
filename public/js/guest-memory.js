document.addEventListener('DOMContentLoaded', () => {
    // Éléments
    const realForm = document.getElementById('real-comment-form');
    const loginPlaceholder = document.getElementById('guest-login-placeholder');
    const createProfileBtn = document.getElementById('create-guest-profile-btn');
    
    const hiddenName = document.getElementById('author_name');
    const hiddenEmail = document.getElementById('author_email');
    const hiddenStyle = document.getElementById('author_avatar_style');
    
    const displayName = document.getElementById('display-guest-name');
    const avatarPreview = document.getElementById('guest-avatar-preview');
    const editBtn = document.getElementById('guest-edit-btn');
    const logoutBtn = document.getElementById('guest-logout-btn');

    // Si on est admin (pas de placeholder), on arrête
    if (!loginPlaceholder) return;

    // --- 1. FONCTION : Pop-up Configuration ---
    const promptProfile = async () => {
        const storedName = localStorage.getItem('blog_guest_username') || '';
        const storedEmail = localStorage.getItem('blog_guest_email') || '';
        const storedStyle = localStorage.getItem('blog_guest_avatar_style') || 'bottts';

        const { value: formValues } = await Swal.fire({
            title: 'Créer votre profil',
            html:
                `<input id="swal-name" class="swal2-input" placeholder="Pseudo" value="${storedName}">` +
                `<input id="swal-email" class="swal2-input" type="email" placeholder="Email (privé)" value="${storedEmail}">` +
                `<select id="swal-style" class="swal2-input"><option value="bottts">🤖 Robots</option><option value="avataaars">🧑 Humains</option><option value="monsterrr">👾 Monstres</option></select>`,
            focusConfirm: false,
            showCancelButton: true,
            preConfirm: () => {
                const name = document.getElementById('swal-name').value;
                const email = document.getElementById('swal-email').value;
                const style = document.getElementById('swal-style').value;
                if (!name || !email) return Swal.showValidationMessage('Champs requis');
                return { name, email, style };
            }
        });

        if (formValues) {
            localStorage.setItem('blog_guest_username', formValues.name);
            localStorage.setItem('blog_guest_email', formValues.email);
            localStorage.setItem('blog_guest_avatar_style', formValues.style);
            updateUI();
        }
    };

    // --- 2. FONCTION : Mise à jour UI ---
    const updateUI = () => {
        const name = localStorage.getItem('blog_guest_username');
        const email = localStorage.getItem('blog_guest_email');
        const style = localStorage.getItem('blog_guest_avatar_style') || 'bottts';

        if (name && email) {
            // CONNECTÉ : On affiche le formulaire, on cache le bouton login
            loginPlaceholder.style.display = 'none';
            realForm.style.display = 'block';
            
            // Remplir les champs
            hiddenName.value = name;
            hiddenEmail.value = email;
            hiddenStyle.value = style;
            
            displayName.textContent = name;
            const avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(name)}`;
            avatarPreview.innerHTML = `<img src="${avatarUrl}" style="width:30px; height:30px; border-radius:50%; vertical-align:middle; margin-right:10px;">`;
        } else {
            // DÉCONNECTÉ : On cache le formulaire, on affiche le bouton login
            loginPlaceholder.style.display = 'block';
            realForm.style.display = 'none';
        }
    };

    // --- 3. FONCTION : Déconnexion ---
    const handleLogout = () => {
        localStorage.clear(); // Ou removeItem un par un
        updateUI();
    };

    // --- INITIALISATION ---
    updateUI();
    if (createProfileBtn) createProfileBtn.addEventListener('click', promptProfile);
    if (editBtn) editBtn.addEventListener('click', promptProfile);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
});