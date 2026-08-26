(function () {
  var newsletterForm = document.getElementById('newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', function (e) {
      e.preventDefault();
      document.getElementById('newsletter-note').textContent =
        '¡Gracias! En cuanto activemos los envíos, tu correo será el primero en la lista.';
      newsletterForm.reset();
    });
  }

  var menuBtn = document.getElementById('mobile-menu-btn');
  var menuPanel = document.getElementById('mobile-menu-panel');
  var menuIconOpen = document.getElementById('mobile-menu-icon-open');
  var menuIconClose = document.getElementById('mobile-menu-icon-close');
  if (menuBtn && menuPanel) {
    menuBtn.addEventListener('click', function () {
      var isOpen = !menuPanel.classList.contains('hidden');
      menuPanel.classList.toggle('hidden');
      if (menuIconOpen) menuIconOpen.classList.toggle('hidden');
      if (menuIconClose) menuIconClose.classList.toggle('hidden');
      menuBtn.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  var categorySelect = document.getElementById('category-select');
  if (categorySelect) {
    categorySelect.addEventListener('change', function () {
      categorySelect.form.submit();
    });
  }

  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });
})();
