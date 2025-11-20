document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. Graphique HEBDOMADAIRE ---
    const weeklyCtx = document.getElementById('weeklyChart');
    if (weeklyCtx) {
        // On récupère les données injectées dans le HTML
        const weeklyData = JSON.parse(weeklyCtx.dataset.stats || '[]');
        
        new Chart(weeklyCtx, {
            type: 'bar',
            data: {
                labels: weeklyData.map(d => d.period),
                datasets: [{
                    label: 'Entrées',
                    data: weeklyData.map(d => d.count),
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // --- 2. Graphique MENSUEL ---
    const monthlyCtx = document.getElementById('monthlyChart');
    if (monthlyCtx) {
        const monthlyData = JSON.parse(monthlyCtx.dataset.stats || '[]');

        new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: monthlyData.map(d => d.period),
                datasets: [{
                    label: 'Progression',
                    data: monthlyData.map(d => d.count),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // --- 3. Graphique TAGS ---
    const tagsCtx = document.getElementById('tagsChart');
    if (tagsCtx) {
        const tagData = JSON.parse(tagsCtx.dataset.stats || '[]');

        new Chart(tagsCtx, {
            type: 'doughnut',
            data: {
                labels: tagData.map(d => d.label),
                datasets: [{
                    data: tagData.map(d => d.count),
                    backgroundColor: [
                        '#0056b3', '#00e0eb', '#8B4513', '#28a745', '#ffc107', 
                        '#dc3545', '#6610f2', '#fd7e14', '#20c997', '#e83e8c'
                    ],
                    borderWidth: 1,
                    borderColor: getComputedStyle(document.body).getPropertyValue('--c-surface').trim()
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: 'gray' }
                    }
                }
            }
        });
    }
});