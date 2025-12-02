document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-pause-btn');
    const vinyl = document.getElementById('vinyl');
    const audio = document.getElementById('audio-player');
    const icon = playBtn ? playBtn.querySelector('i') : null;
    const zenBtn = document.getElementById('zen-mode-btn'); // Le déclencheur Zen
    const widget = document.getElementById('music-widget');

    if (!playBtn || !audio) return;

    audio.volume = 0.3;

    const playMusic = () => {
        audio.play().then(() => {
            vinyl.classList.add('spinning');
            icon.classList.replace('fa-play', 'fa-pause');
        }).catch(e => console.log("Autoplay bloqué (normal si pas d'interaction)", e));
    };

    const pauseMusic = () => {
        audio.pause();
        vinyl.classList.remove('spinning');
        icon.classList.replace('fa-pause', 'fa-play');
    };

    const toggleMusic = () => {
        if (audio.paused) playMusic();
        else pauseMusic();
    };

    if (widget) widget.style.display = 'none';

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === "class") {
                const isZen = document.body.classList.contains('zen-mode');

                if (isZen) {
                    if (widget) {
                        widget.style.display = 'flex';
                        widget.style.animation = 'fadeIn 0.5s ease';
                    }
                    playMusic();
                } else {
                    if (widget) widget.style.display = 'none';
                    pauseMusic();
                }
            }
        });
    });

    observer.observe(document.body, { attributes: true });

    playBtn.addEventListener('click', toggleMusic);

    audio.addEventListener('ended', () => {
        vinyl.classList.remove('spinning');
        icon.classList.replace('fa-pause', 'fa-play');
    });
});