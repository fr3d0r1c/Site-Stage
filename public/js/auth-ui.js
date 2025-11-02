document.addEventListener('DOMContentLoaded', () => {

    // --- Logique "Voir/Cacher" Mot de Passe (Générique) ---
    // Trouve TOUS les boutons qui ont la classe 'toggle-password-icon'
    const toggleButtons = document.querySelectorAll('.toggle-password-icon');

    toggleButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Récupère l'ID de l'input cible (ex: 'password' ou 'currentPassword')
            const targetId = this.getAttribute('data-target'); 
            if (!targetId) return;
            
            const passwordInput = document.getElementById(targetId);
            if (!passwordInput) return;

            // Logique de bascule (inchangée)
            const currentType = passwordInput.getAttribute('type');
            if (currentType === 'password') {
                passwordInput.setAttribute('type', 'text');
                this.classList.remove('fa-eye');
                this.classList.add('fa-eye-slash');
            } else {
                passwordInput.setAttribute('type', 'password');
                this.classList.remove('fa-eye-slash');
                this.classList.add('fa-eye');
            }
        });
    });

    // --- Logique Indicateur de Force (Spécifique à 'register.ejs') ---
    const passwordInputStrength = document.getElementById('password'); // Cible l'input de register.ejs
    const feedbackDiv = document.getElementById('password-strength-feedback');
    
    // Ce bloc ne s'exécutera que sur la page d'inscription (car feedbackDiv n'existe que là)
    if (passwordInputStrength && feedbackDiv) { 
        passwordInputStrength.addEventListener('input', () => {
            // ... (Toute la logique de l'indicateur de force reste ici, inchangée) ...
            const password = passwordInputStrength.value;
            const criteria = {
                length: password.length >= 8,
                lowercase: /[a-z]/.test(password),
                uppercase: /[A-Z]/.test(password),
                digit: /[0-9]/.test(password),
                special: /[^a-zA-Z0-9]/.test(password)
            };
            criteria.letter = criteria.lowercase || criteria.uppercase; 
            let score = 0;
            if (criteria.length) score++;
            if (criteria.letter) score++;
            if (criteria.digit) score++;
            if (criteria.special) score++;
            let feedbackText = '';
            let feedbackColor = 'grey';
            let requirementsMet = criteria.length && criteria.letter && criteria.digit && criteria.special;
            if (password.length > 0) {
                 if (requirementsMet) { feedbackText = 'Fort'; feedbackColor = '#2ecc71'; }
                 else if (score >= 3 && criteria.length) { feedbackText = 'Moyen'; feedbackColor = '#f39c12'; }
                 else { feedbackText = 'Faible'; feedbackColor = 'var(--c-danger)'; }
            }
            let detailedFeedback = '';
            if (password.length > 0) {
                detailedFeedback += `Force : ${feedbackText}. `;
                let missing = [];
                if (!criteria.length) missing.push("8 caractères min");
                if (!criteria.letter) missing.push("lettres");
                if (!criteria.digit) missing.push("chiffres");
                if (!criteria.special) missing.push("caractères spéciaux");
                if (missing.length > 0) { detailedFeedback += ` (Manque : ${missing.join(', ')})`; }
            }
            feedbackDiv.textContent = detailedFeedback;
            feedbackDiv.style.color = feedbackColor;
        });
    }
});