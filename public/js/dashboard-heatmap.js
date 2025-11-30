document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('contribution-heatmap');

    if (!container) return;

    const rawData = container.getAttribute('data-activity');

    let data = {};
    try {
        data = JSON.parse(rawData); // Convertir la chaîne JSON en objet JS
    } catch (e) {
        console.error("Erreur parsing Heatmap data", e);
        return;
    }

    const today = new Date();
    for (let i = 365; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];

        const count = data[dateStr] || 0;
        let level = 0;
        if (count >= 1) level = 1;
        if (count >= 3) level = 2;
        if (count >= 5) level = 3;
        if (count >= 8) level = 4;

        const square = document.createElement('div');
        square.className = `heat-box level-${level}`;
        square.title = `${dateStr} : ${count} contribution(s)`;
        container.appendChild(square);
    }
});