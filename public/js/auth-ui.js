document.addEventListener('DOMContentLoaded', () => {

    // --- Logique pour "Voir/Cacher" Mot de Passe (login + register) ---
    const passwordInputToggle = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');

    if (passwordInputToggle && togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', function() {
            const currentType = passwordInputToggle.getAttribute('type');
            if (currentType === 'password') {
                passwordInputToggle.setAttribute('type', 'text');
                // Gère l'icône ou le texte
                if (this.classList.contains('fas')) { // Si c'est une icône Font Awesome
                    this.classList.remove('fa-eye');
                    this.classList.add('fa-eye-slash');
                } else { // Si c'est le texte "Voir"
                    this.textContent = 'Cacher';
                }
            } else {
                passwordInputToggle.setAttribute('type', 'password');
                // Gère l'icône ou le texte
                if (this.classList.contains('fas')) {
                    this.classList.remove('fa-eye-slash');
                    this.classList.add('fa-eye');
                } else {
                    this.textContent = 'Voir';
                }
            }
        });
    }

    // --- Logique pour l'Indicateur de Force (register uniquement) ---
    const passwordInputStrength = document.getElementById('password'); // Le même input
    const feedbackDiv = document.getElementById('password-strength-feedback');

    if (passwordInputStrength && feedbackDiv) { // Ne s'exécute que si on trouve le feedbackDiv
        passwordInputStrength.addEventListener('input', () => {
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
                 if (requirementsMet) {
                     feedbackText = 'Fort'; feedbackColor = '#2ecc71';
                 } else if (score >= 3 && criteria.length) {
                     feedbackText = 'Moyen'; feedbackColor = '#f39c12';
                 } else {
                     feedbackText = 'Faible'; feedbackColor = 'var(--c-danger)';
                 }
            }
            let detailedFeedback = '';
            if (password.length > 0) {
                detailedFeedback += `Force : ${feedbackText}. `;
                let missing = [];
                if (!criteria.length) missing.push("8 caractères min");
                if (!criteria.letter) missing.push("lettres");
                if (!criteria.digit) missing.push("chiffres");
                if (!criteria.special) missing.push("caractères spéciaux");
                if (missing.length > 0) {
                    detailedFeedback += ` (Manque : ${missing.join(', ')})`;
                }
            }
            feedbackDiv.textContent = detailedFeedback;
            feedbackDiv.style.color = feedbackColor;
        });
    }
});