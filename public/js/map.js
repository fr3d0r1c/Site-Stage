document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');

    if (mapElement) {
        // 1. Récupérer les lieux
        const locations = JSON.parse(mapElement.dataset.locations || '[]');

        if (locations.length === 0) return;

        // 2. Initialiser la carte
        const map = L.map('map');

        // 3. Ajouter les tuiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        // 4. Créer les marqueurs
        const markersGroup = new L.featureGroup();
        const pathCoordinates = [];

        locations.forEach(loc => {
            const point = [loc.lat, loc.lng];
            
            // --- CRÉATION DE L'ICÔNE PERSONNALISÉE ---
            // On utilise l'icône fournie ou une par défaut (fa-map-marker-alt)
            const iconClass = loc.icon || 'fa-map-marker-alt';
            
            const customIcon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div class="marker-pin" role="button" aria-label="Voir le lieu : ${loc.title}" tabindex="0"><i class="fas ${iconClass}"></i></div>`,
                iconSize: [40, 40], // Taille du bloc
                iconAnchor: [20, 20], // Point d'ancrage (le centre du cercle : 20,20)
                popupAnchor: [0, -25] // Où s'ouvre la bulle par rapport au centre
            });
            // -----------------------------------------

            // Ajoute le marqueur avec l'icône personnalisée
            const marker = L.marker(point, { icon: customIcon })
                .bindPopup(`<b>${loc.title}</b><br>${loc.desc}`);
            
            markersGroup.addLayer(marker);
            pathCoordinates.push(point);
        });

        // 5. Ajouter le groupe
        map.addLayer(markersGroup);

        // 6. Dessiner le chemin (Ligne)
        if (pathCoordinates.length > 1) {
            const themeColor = getComputedStyle(document.body).getPropertyValue('--c-primary').trim() || '#0056b3';
            const polyline = L.polyline(pathCoordinates, {
                color: themeColor,
                weight: 4,
                opacity: 0.7,
                dashArray: '10, 10',
                lineJoin: 'round'
            }).addTo(map);
            map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        } else {
            map.fitBounds(markersGroup.getBounds(), { padding: [50, 50] });
        }
    }
});