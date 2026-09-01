// La cámara. Traduce el scroll nativo en movimiento de capas: nada de
// scroll-jacking — el visitante conserva su scroll, su teclado y su inercia;
// lo único que cambia es a qué velocidad se mueve cada profundidad.
(function () {
  var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
  if (!scenes.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function paint() {
    var vh = window.innerHeight;

    scenes.forEach(function (scene) {
      var box = scene.getBoundingClientRect();
      if (box.bottom < -vh * 0.5 || box.top > vh * 1.5) return;

      // 0 cuando la escena entra por abajo, 1 cuando termina de salir por arriba.
      var p = (vh - box.top) / (vh + box.height);
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      scene.style.setProperty('--p', p.toFixed(4));

      var layers = scene.querySelectorAll('[data-depth]');
      for (var i = 0; i < layers.length; i++) {
        var depth = parseFloat(layers[i].getAttribute('data-depth')) || 0;
        // Lo cercano recorre más que lo lejano: eso es la profundidad.
        var shift = (p - 0.5) * depth * vh * 0.42;
        var zoom = 1 + depth * 0.035;
        layers[i].style.transform =
          'translate3d(0,' + shift.toFixed(2) + 'px,0) scale(' + zoom.toFixed(4) + ')';
      }
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      paint();
      ticking = false;
    });
  }

  function start() {
    if (reduced.matches) {
      scenes.forEach(function (scene) {
        scene.style.setProperty('--p', '0.5');
        var layers = scene.querySelectorAll('[data-depth]');
        for (var i = 0; i < layers.length; i++) layers[i].style.transform = '';
      });
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      return;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    paint();
  }

  start();
  if (reduced.addEventListener) reduced.addEventListener('change', start);

  // Revelado por estrato: cada toma entra cuando la cámara llega, no antes.
  if ('IntersectionObserver' in window) {
    var seen = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-seen', '');
            seen.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.22 }
    );
    scenes.forEach(function (scene) {
      seen.observe(scene);
    });
  } else {
    scenes.forEach(function (scene) {
      scene.setAttribute('data-seen', '');
    });
  }

  // ——— El mundo se recorre de lado ———
  // El carril ya funciona solo (scroll nativo + snap). Esto añade el pan suave
  // al pulsar un ecosistema, las flechas y el estado activo del menú.
  (function () {
    var track = document.getElementById('world-track');
    var menu = document.getElementById('world-menu');
    if (!track || !menu) return;

    var panels = Array.prototype.slice.call(track.querySelectorAll('[data-biome]'));
    var links = Array.prototype.slice.call(menu.querySelectorAll('[data-goto]'));
    var steps = document.getElementById('world-steps');
    var current = 0;
    if (!panels.length) return;

    function go(i, smooth) {
      var target = panels[Math.max(0, Math.min(panels.length - 1, i))];
      if (!target) return;
      track.scrollTo({
        left: target.offsetLeft - track.offsetLeft,
        behavior: smooth && !reduced.matches ? 'smooth' : 'auto'
      });
    }

    function mark(i) {
      current = i;
      links.forEach(function (a, ai) {
        if (ai === i) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      if (steps) {
        steps.querySelector('[data-step="-1"]').disabled = i <= 0;
        steps.querySelector('[data-step="1"]').disabled = i >= panels.length - 1;
      }
    }

    links.forEach(function (a, ai) {
      a.addEventListener('click', function (e) {
        // Sin preventDefault el ancla arrastraría también el scroll vertical.
        e.preventDefault();
        go(ai, true);
      });
    });

    if (steps) {
      steps.hidden = false;
      steps.querySelectorAll('[data-step]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          go(current + Number(btn.getAttribute('data-step')), true);
        });
      });
    }

    // Quién manda es el scroll, venga de donde venga: swipe, teclado o flechas.
    if ('IntersectionObserver' in window) {
      var watcher = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) mark(panels.indexOf(entry.target));
          });
        },
        { root: track, threshold: 0.55 }
      );
      panels.forEach(function (p) { watcher.observe(p); });
    }

    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1, true); }
    });

    mark(0);

    // ——— El paso de un ecosistema a otro ———
    // El carril ya llevaba de una isla a la siguiente, pero entre las dos no
    // ocurría nada: seis láminas pasando de lado. Aquí el scroll manda sobre la
    // escena — la isla que se va se aleja y se apaga, la que llega entra desde
    // el fondo — y el desplazamiento lateral se lee como una cámara que recorre
    // el mundo. No hay animación propia: si el dedo se detiene, la cámara se
    // queda donde la dejaron.
    if (!reduced.matches) {
      var islands = panels.map(function (p) { return p.querySelector('[data-island]'); });
      var ticking = false;

      function pan() {
        ticking = false;
        var width = track.clientWidth;
        if (!width) return;
        var mid = track.scrollLeft + width / 2;

        panels.forEach(function (p, pi) {
          var centre = p.offsetLeft - track.offsetLeft + p.clientWidth / 2;
          // Cuánto le falta a este ecosistema para estar de frente: 0 en el
          // centro, 1 cuando ya es el vecino de al lado.
          var off = Math.max(-1, Math.min(1, (centre - mid) / width));
          var away = Math.abs(off);

          p.style.opacity = (1 - away * 0.72).toFixed(3);
          var island = islands[pi];
          if (island) {
            island.style.transform =
              'translate3d(' + (off * -9).toFixed(2) + '%, 0, 0) scale(' +
              (1 - away * 0.07).toFixed(3) + ')';
          }
        });
      }

      track.addEventListener(
        'scroll',
        function () {
          if (ticking) return;
          ticking = true;
          window.requestAnimationFrame(pan);
        },
        { passive: true }
      );
      window.addEventListener('resize', pan, { passive: true });
      pan();
    }

    // Un enlace directo (/#bioma-desierto) debe abrir en ese ecosistema.
    var hash = window.location.hash;
    if (hash) {
      var wanted = panels.indexOf(track.querySelector(hash));
      if (wanted > -1) { go(wanted, false); mark(wanted); }
    }
  })();

  // Táctil: sin hover, el primer toque descubre la planta y el segundo entra.
  // Así el descubrimiento se conserva en móvil en vez de saltárselo.
  var canHover = window.matchMedia('(hover: hover)').matches;
  if (!canHover) {
    var open = null;
    document.querySelectorAll('.inhabitant, .iso-plant').forEach(function (node) {
      node.addEventListener('click', function (e) {
        if (node === open) return; // segundo toque: deja pasar el enlace
        e.preventDefault();
        if (open) open.classList.remove('is-open');
        node.classList.add('is-open');
        open = node;
      });
    });
    document.addEventListener('click', function (e) {
      if (open && !open.contains(e.target)) {
        open.classList.remove('is-open');
        open = null;
      }
    });
  }
})();
