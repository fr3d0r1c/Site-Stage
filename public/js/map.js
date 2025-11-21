document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');

    if (mapElement) {
        // 1. Récupérer les lieux depuis l'attribut data-locations
        const locations = JSON.parse(mapElement.dataset.locations || '[]');

        if (locations.length === 0) return;

        // 2. Initialiser la carte (centrée sur le premier point par défaut)
        const map = L.map('map');

        // 3. Ajouter les tuiles OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        // 4. Créer un groupe de marqueurs pour ajuster le zoom automatiquement
        const markersGroup = new L.featureGroup();

        // 5. Ajouter chaque marqueur
        locations.forEach(loc => {
            const marker = L.marker([loc.lat, loc.lng])
                .bindPopup(`<b>${loc.title}</b><br>${loc.desc}`);
            
            markersGroup.addLayer(marker);
        });

        // 6. Ajouter le groupe à la carte
        map.addLayer(markersGroup);

        // 7. Ajuster la vue pour montrer tous les marqueurs
        map.fitBounds(markersGroup.getBounds(), { padding: [50, 50] });
    }
});