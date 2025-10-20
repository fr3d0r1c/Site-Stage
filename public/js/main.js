const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');

navToggle.addEventListener('click', () => {
    nav.classList.toggle('nav-visible');
    navToggle.classList.toggle('is-active');
});