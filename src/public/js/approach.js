// La entrada al bioma. La sección es alta y la toma queda fija: mientras el
// visitante baja, su scroll elige qué cuadro de la secuencia se dibuja, y en el
// último tramo el bioma se abre en sus variedades.
// No hay scroll-jacking ni animación propia: si deja de bajar, la cámara se
// queda donde la dejó.
(function () {
  var stage = document.querySelector('[data-approach]');
  if (!stage) return;

  var canvas = stage.querySelector('[data-approach-canvas]');
  var total = parseInt(stage.getAttribute('data-frames'), 10);
  var base = stage.getAttribute('data-src');
  // La huella del dibujo: cambia con el arte, y con ella la URL de los cuadros.
  var version = stage.getAttribute('data-version') ? '?v=' + stage.getAttribute('data-version') : '';

  // Con fotos reales la lista viene dada por el servidor; con el dibujo, los
  // cuadros van numerados. De aquí en adelante da igual cuál de los dos sea.
  var names = null;
  try { names = JSON.parse(stage.getAttribute('data-list') || 'null'); } catch (e) { names = null; }
  function url(i) {
    return names ? base + encodeURIComponent(names[i]) : base + i + '.svg' + version;
  }
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx || !total || !base) return;

  // Desde aquí el primer plano ya pasó y lo que crece en el bioma puede leerse.
  var OPEN = 0.72;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var frames = new Array(total);
  var ready = new Array(total);
  var target = 0;      // el cuadro que pide el scroll
  var painted = -1;    // el que está dibujado
  var pos = 0;         // avance 0→1, para el acercamiento del propio cuadro
  var paintedPos = -1;
  var open = null;

  // ——— Precarga ———
  // En orden y de a pocas: los primeros cuadros son los que se ven primero, y
  // pedir la secuencia entera de golpe hace que ninguna imagen llegue a tiempo.
  var next = 0, inflight = 0;
  function pump() {
    while (inflight < 5 && next < total) {
      (function (i) {
        var img = new Image();
        img.decoding = 'async';
        inflight++;
        img.onload = function () { ready[i] = true; inflight--; paint(); pump(); };
        img.onerror = function () { inflight--; pump(); };
        frames[i] = img;
        img.src = url(i);
      })(next++);
    }
  }

  // Mientras el cuadro exacto no haya llegado se dibuja el más cercano que sí:
  // la cámara se ve un poco menos fina, nunca en negro.
  function nearest(i) {
    if (ready[i]) return i;
    for (var d = 1; d < total; d++) {
      if (i - d >= 0 && ready[i - d]) return i - d;
      if (i + d < total && ready[i + d]) return i + d;
    }
    return -1;
  }

  function paint() {
    var i = nearest(target);
    if (i < 0) return;
    if (i === painted && Math.abs(pos - paintedPos) < 0.002) return;
    var img = frames[i];
    var cw = canvas.width, ch = canvas.height;
    if (!cw || !ch || !img.naturalWidth) return;
    // El cuadro cubre el lienzo sin deformarse, como object-fit: cover, y se
    // acerca con el avance: discreto cuando hay secuencia —que ya avanza sola—
    // y protagonista cuando solo hay una foto, que es todo el movimiento que
    // esa foto puede dar.
    var push = total > 1 ? 0.12 : 0.5;
    var k = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * (1 + push * pos);
    var w = img.naturalWidth * k, h = img.naturalHeight * k;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2 - ch * 0.03 * pos, w, h);
    painted = i;
    paintedPos = pos;
  }

  function fit() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(canvas.clientWidth * dpr);
    var h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h || (w === canvas.width && h === canvas.height)) return;
    canvas.width = w;
    canvas.height = h;
    painted = -1;
    paintedPos = -1;
    paint();
  }

  // 0 cuando la sección empieza a pasar, 1 cuando termina.
  function progress() {
    var box = stage.getBoundingClientRect();
    var span = box.height - window.innerHeight;
    if (span <= 0) return 0;
    var p = -box.top / span;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  function mark(p) {
    var now = p >= OPEN;
    if (now === open) return;
    open = now;
    if (now) stage.setAttribute('data-open', '');
    else stage.removeAttribute('data-open');
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var p = progress();
      pos = p;
      target = Math.round(p * (total - 1));
      stage.style.setProperty('--p', p.toFixed(4));
      mark(p);
      paint();
      ticking = false;
    });
  }

  function onResize() {
    fit();
    onScroll();
  }

  function start() {
    if (reduced.matches) {
      // Sin scrubbing: la sección se aplana, queda una sola vista del bioma y
      // las variedades se leen debajo, siempre visibles.
      stage.removeAttribute('data-ready');
      stage.setAttribute('data-open', '');
      open = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      target = Math.round((total - 1) * 0.62);
      fit();
      paint();
      return;
    }
    stage.setAttribute('data-ready', '');
    fit();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    onScroll();
  }

  start();
  if (reduced.addEventListener) reduced.addEventListener('change', start);

  // La descarga arranca cuando la página ya cargó lo suyo: la entrada al bioma
  // es la segunda escena, no compite con la portada.
  if (document.readyState === 'complete') pump();
  else window.addEventListener('load', pump);
})();
