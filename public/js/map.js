document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    if (mapElement.dataset.locations) {
        const locations = JSON.parse(mapElement.dataset.locations || '[]');

        const timelineItems = document.querySelectorAll('.timeline-item');
        if (locations.length !== timelineItems.length) {
            console.warn(`⚠️ ATTENTION : Il y a ${locations.length} points sur la carte mais ${timelineItems.length} éléments dans la timeline. Pensez à synchroniser les deux !`);
        }

        if (locations.length === 0) return;

        const firstLoc = locations[0];
        const map = L.map('map').setView([firstLoc.lat, firstLoc.lng], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

        const markers = [];
        const pathCoordinates = [];

        locations.forEach((loc, index) => {
            const point = [loc.lat, loc.lng];
            const iconClass = loc.icon || 'fa-map-marker-alt';

            const customIcon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div class="marker-pin"><i class="fas ${iconClass}"></i></div>`,
                iconSize: [40, 40],
                iconAnchor: [20, 20],
                popupAnchor: [0, -25]
            });

            const marker = L.marker(point, { icon: customIcon }).bindPopup(`<b>${loc.title}</b>`);
            marker.addTo(map);
            markers.push(marker);
            pathCoordinates.push(point);
        });

        if (pathCoordinates.length > 1) {
            const style = getComputedStyle(document.body);
            const themeColor = style.getPropertyValue('--c-primary').trim() || '#0056b3';
            L.polyline(pathCoordinates, { color: themeColor, weight: 3, dashArray: '10, 10' }).addTo(map);
        }

        const prevBtn = document.getElementById('prev-step-btn');
        const nextBtn = document.getElementById('next-step-btn');
        const indicator = document.getElementById('step-indicator');

        let currentIndex = 0;

        function updateStep(index) {
            const loc = locations[index];
            map.flyTo([loc.lat, loc.lng], 14, { duration: 1.5 });
            markers[index].openPopup();

            document.querySelectorAll('.timeline-item').forEach(item => item.classList.remove('active'));
            const activeItem = document.getElementById(`step-${index}`);
            if (activeItem) {
                activeItem.classList.add('active');
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            if (indicator) {
                indicator.textContent = `${index + 1} / ${locations.length}`;
            }

            if (prevBtn && nextBtn) {
                prevBtn.disabled = (index === 0);
                nextBtn.disabled = (index === locations.length - 1);
            }

            currentIndex = index;
        }

        updateStep(0);

        if (prevBtn) prevBtn.addEventListener('click', () => {
            if (currentIndex > 0) updateStep(currentIndex - 1);
        });

        if (nextBtn) nextBtn.addEventListener('click', () => {
            if (currentIndex < locations.length - 1) updateStep(currentIndex + 1);
        });
    }

    else if (mapElement.dataset.lat) {
        const lat = parseFloat(mapElement.dataset.lat);
        const lng = parseFloat(mapElement.dataset.lng);
        const map = L.map('map').setView([lat, lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
        L.marker([lat, lng]).addTo(map).bindPopup("<b>Localisation</b>").openPopup();
    }
});