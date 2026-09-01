/*
  Medición para Google Ads y TikTok Ads.

  Un anuncio sin esto no es un anuncio: es un gasto. La plataforma necesita
  saber qué clic terminó en compra para poder optimizar hacia las personas que
  compran; sin el evento de conversión, tanto Google como TikTok reparten el
  presupuesto a ciegas y el algoritmo nunca aprende.

  Reglas de la casa:
  - Nada de terceros se carga antes de que el visitante acepte. La política de
    privacidad promete pedir consentimiento explícito y esa promesa manda sobre
    la comodidad de medir. Quien rechaza no recibe ni una petición.
  - Los identificadores llegan desde el servidor. Si no hay pixel configurado,
    este archivo ni siquiera se incluye en la página.
*/
(function () {
  var CONSENT_KEY = 'arborea.consent';

  function readJson(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  var config = readJson('measure-config');
  if (!config) return;

  var hasGoogle = Boolean(config.ga4 || config.ads);
  var hasTiktok = Boolean(config.tiktok);
  if (!hasGoogle && !hasTiktok) return;

  // Los eventos que el servidor adjuntó a esta página. Se guardan hasta que
  // haya consentimiento: si llega después, se envían todos de una; si nunca
  // llega, mueren aquí.
  var pending = readJson('measure-events') || [];
  var loaded = false;

  function stored() {
    try {
      return window.localStorage.getItem(CONSENT_KEY);
    } catch (e) {
      // Navegación privada o almacenamiento bloqueado: se trata como "aún no
      // decidió", que es el estado más conservador.
      return null;
    }
  }

  function remember(value) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {
      /* sin memoria: se volverá a preguntar en la próxima visita */
    }
  }

  // --- Google (Analytics 4 + Ads) ---

  function gtag() {
    window.dataLayer.push(arguments);
  }

  function loadGoogle() {
    window.dataLayer = window.dataLayer || [];
    gtag('js', new Date());

    // Consent Mode v2. Aunque aquí el script solo se carga tras aceptar, las
    // dos señales se declaran igual: es lo que Google exige desde marzo de 2024
    // para poder usar públicos y remarketing sin que la cuenta quede limitada.
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied'
    });
    gtag('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted'
    });

    var primary = config.ga4 || config.ads;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(primary);
    document.head.appendChild(s);

    if (config.ga4) gtag('config', config.ga4);
    // La etiqueta de Ads va aparte de la de Analytics: son dos productos y dos
    // identificadores, y configurar solo uno deja al otro sin datos.
    if (config.ads) gtag('config', config.ads);
  }

  // --- TikTok ---

  function loadTiktok() {
    // El SDK de TikTok no recibe el nombre de su cola como parámetro: lo lee de
    // esta variable global al arrancar. Sin ella busca `window[undefined]` y
    // revienta al inicializarse, dejando el pixel instalado pero mudo.
    window.TiktokAnalyticsObject = 'ttq';
    var ttq = (window.ttq = window.ttq || []);
    ttq.methods = [
      'page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once',
      'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent',
      'revokeConsent', 'grantConsent'
    ];
    ttq.setAndDefer = function (target, method) {
      target[method] = function () {
        target.push([method].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);

    ttq.instance = function (id) {
      var inst = (ttq._i && ttq._i[id]) || [];
      for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(inst, ttq.methods[n]);
      return inst;
    };

    ttq.load = function (id) {
      var url = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._i = ttq._i || {};
      ttq._i[id] = [];
      ttq._i[id]._u = url;
      ttq._t = ttq._t || {};
      ttq._t[id] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[id] = {};
      var s = document.createElement('script');
      s.async = true;
      s.src = url + '?sdkid=' + encodeURIComponent(id) + '&lib=ttq';
      document.head.appendChild(s);
    };

    ttq.load(config.tiktok);
    ttq.page();
  }

  // --- Traducción de eventos ---
  //
  // El servidor manda un solo vocabulario (el de Google, que es el estándar de
  // comercio electrónico) y aquí se traduce al de cada plataforma. Así una
  // vista de producto se declara una vez y llega correcta a las dos.

  var TIKTOK_NAMES = {
    view_item: 'ViewContent',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
    purchase: 'CompletePayment'
  };

  function tiktokPayload(e) {
    return {
      contents: (e.items || []).map(function (i) {
        return {
          content_id: String(i.item_id),
          content_name: i.item_name,
          content_type: 'product',
          quantity: i.quantity || 1,
          price: i.price
        };
      }),
      value: e.value,
      currency: e.currency || config.currency
    };
  }

  function send(e) {
    if (!e || !e.name) return;

    if (hasGoogle && window.dataLayer) {
      gtag('event', e.name, {
        currency: e.currency || config.currency,
        value: e.value,
        transaction_id: e.transaction_id,
        items: e.items
      });

      // La compra se declara dos veces a propósito: una como evento de
      // Analytics (para los informes) y otra como conversión de Ads (para que
      // la puja aprenda). Sin la segunda, Google Ads no ve ninguna venta.
      if (e.name === 'purchase' && config.ads && config.adsPurchaseLabel) {
        gtag('event', 'conversion', {
          send_to: config.ads + '/' + config.adsPurchaseLabel,
          value: e.value,
          currency: e.currency || config.currency,
          transaction_id: e.transaction_id
        });
      }
    }

    if (hasTiktok && window.ttq && TIKTOK_NAMES[e.name]) {
      window.ttq.track(TIKTOK_NAMES[e.name], tiktokPayload(e));
      // TikTok separa "hizo el pedido" de "pagó". Este flujo confirma por
      // WhatsApp antes de cobrar, así que el pedido creado es lo más cercano a
      // una venta que el sitio puede afirmar, y se reporta como las dos cosas.
      if (e.name === 'purchase') window.ttq.track('PlaceAnOrder', tiktokPayload(e));
    }
  }

  function activate() {
    if (loaded) return;
    loaded = true;
    if (hasGoogle) loadGoogle();
    if (hasTiktok) loadTiktok();
    pending.forEach(send);
    pending = [];
  }

  // --- Aviso de cookies ---

  var banner = document.getElementById('consent-banner');

  function decide(value) {
    remember(value);
    if (banner) banner.hidden = true;
    if (value === 'granted') activate();
  }

  // La política de privacidad ofrece volver sobre la decisión. Olvidar lo
  // elegido y recargar deja la página en el mismo estado que una primera
  // visita: vuelve a aparecer el aviso y nada se ha cargado todavía.
  var reset = document.getElementById('consent-reset');
  if (reset) {
    reset.addEventListener('click', function () {
      try {
        window.localStorage.removeItem(CONSENT_KEY);
      } catch (e) {
        /* sin memoria que borrar */
      }
      window.location.reload();
    });
  }

  var choice = stored();
  if (choice === 'granted') {
    activate();
  } else if (choice !== 'denied' && banner) {
    banner.hidden = false;
    var accept = document.getElementById('consent-accept');
    var reject = document.getElementById('consent-reject');
    if (accept) accept.addEventListener('click', function () { decide('granted'); });
    if (reject) reject.addEventListener('click', function () { decide('denied'); });
  }
})();
