/* ==========================================================
   SECTION 3: MODAL
   ========================================================== */

function showModal(html) {
    document.getElementById('modal-box').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('active');

    setTimeout(function() {
        document.querySelectorAll('.modal, .modal .field').forEach(function(el) {
            el.style.animation = 'none';
            el.style.opacity = '1';
            el.style.transform = 'none';
        });
    }, 400);
}

function hideModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

document.addEventListener('click', function(e) {
    if (e.target.id === 'modal-overlay') hideModal();
});