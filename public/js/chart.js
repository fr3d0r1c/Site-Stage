document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('skillsChart');
    
    // Vos compétences et niveaux (sur 10)
    // Vous pouvez ajuster les valeurs ici !
    const data = {
        labels: ['JavaScript/Node', 'HTML/CSS', 'SQL/Base de données', 'Sécurité/Réseau', 'Git/DevOps', 'Gestion de Projet'],
        datasets: [{
            label: 'Niveau de compétence',
            data: [9, 8, 7, 8, 7, 6], // Vos notes
            fill: true,
            backgroundColor: 'rgba(54, 162, 235, 0.2)', // Bleu transparent
            borderColor: 'rgb(54, 162, 235)',
            pointBackgroundColor: 'rgb(54, 162, 235)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgb(54, 162, 235)'
        }]
    };

    // Détection du thème sombre pour adapter les couleurs du texte
    const isDark = document.body.classList.contains('theme-dark');
    const textColor = isDark ? '#eee' : '#666';
    const gridColor = isDark ? '#444' : '#ddd';

    new Chart(ctx, {
        type: 'radar',
        data: data,
        options: {
            elements: {
                line: { borderWidth: 3 }
            },
            scales: {
                r: {
                    angleLines: { color: gridColor },
                    grid: { color: gridColor },
                    pointLabels: {
                        color: textColor,
                        font: { size: 12, family: "'Inter', sans-serif" }
                    },
                    suggestedMin: 0,
                    suggestedMax: 10,
                    ticks: { display: false } // Cache les chiffres 1, 2, 3... sur l'axe
                }
            },
            plugins: {
                legend: { display: false } // Cache la légende "Niveau de compétence"
            }
        }
    });
});