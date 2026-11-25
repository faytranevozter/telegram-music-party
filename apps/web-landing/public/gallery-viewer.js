(() => {
    const dialog = document.querySelector('#gallery-viewer');
    if (typeof dialog?.showModal !== 'function') return;

    const selector = '.gallery-shot a:has(img)';
    const main = document.querySelector('main');
    const image = dialog.querySelector('img');
    const title = dialog.querySelector('h2');
    const original = dialog.querySelector('.gallery-viewer-original');
    const count = dialog.querySelector('.gallery-viewer-count');
    let slides = [];
    let index = 0;

    function render() {
        const link = slides[index];
        const thumbnail = link.querySelector('img');
        title.textContent = link.closest('figure').querySelector('figcaption').textContent.trim();
        original.href = link.href;
        image.alt = thumbnail.alt;
        image.src = link.href;
        count.textContent = `${index + 1} / ${slides.length}`;
    }

    function move(step) {
        index = (index + step + slides.length) % slides.length;
        render();
    }

    main.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest(selector);
        if (!link) return;
        slides = Array.from(main.querySelectorAll(selector)).filter((item) => item.getClientRects().length);
        index = slides.indexOf(link);
        if (index < 0) return;
        render();
        dialog.showModal();
        event.preventDefault();
    });

    dialog.querySelectorAll('[data-gallery-step]').forEach((button) => {
        button.addEventListener('click', () => move(Number(button.dataset.galleryStep)));
    });

    dialog.addEventListener('keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
    });
})();
