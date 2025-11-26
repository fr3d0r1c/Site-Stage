document.addEventListener('DOMContentLoaded', () => {
    const links = document.querySelectorAll('.article-content a');

    links.forEach(link => {
        const url = link.href;
        let embedUrl = null;

        const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (youtubeMatch) {
            const videoId = youtubeMatch[1];
            embedUrl = `https://www.youtube.com/embed/${videoId}`;
        }

        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) {
            const videoId = vimeoMatch[1];
            embedUrl = `https://player.vimeo.com/video/${videoId}`;
        }

        if (embedUrl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'video-responsive';
            
            const iframe = document.createElement('iframe');
            iframe.src = `${embedUrl}?origin=${window.location.origin}`;
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
            iframe.setAttribute('allowfullscreen', 'true');

            wrapper.appendChild(iframe);
            
            // Remplacement dans le DOM
            link.parentNode.replaceChild(wrapper, link);
        }
    });
});