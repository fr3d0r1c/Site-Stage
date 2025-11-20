document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('tagsChart');
    
    if (ctx) {
        // 1. Récupérer les données stockées dans l'attribut data-stats
        // On doit parser le JSON qui a été injecté dans le HTML
        const rawData = JSON.parse(ctx.dataset.stats || '[]');

        if (rawData.length > 0) {
            
            // Préparation des données pour Chart.js
            const labels = rawData.map(item => item.label);
            const data = rawData.map(item => item.count);
            
            // Palette de couleurs
            const backgroundColors = [
                '#0056b3', '#00e0eb', '#8B4513', '#28a745', '#ffc107', 
                '#dc3545', '#6610f2', '#fd7e14', '#20c997', '#e83e8c'
            ];

            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Nombre d\'entrées',
                        data: data,
                        backgroundColor: backgroundColors.slice(0, data.length),
                        borderWidth: 1,
                        // Astuce pour récupérer la couleur de fond du CSS pour la bordure
                        borderColor: getComputedStyle(document.body).getPropertyValue('--c-surface').trim()
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                // On utilise une couleur compatible avec les thèmes
                                color: getComputedStyle(document.body).getPropertyValue('--c-text-light').trim()
                            }
                        }
                    }
                }
            });
        }
    }
});