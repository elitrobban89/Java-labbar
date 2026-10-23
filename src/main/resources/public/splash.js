/* Java-labbar — (c) 2026 Robert Andersson Kopler. Alla rattigheter forbehallna. */
// Uppstartsskärm för Java-labbar — biblioteket ställs i ordning, sedan räknas budgeten.
//
// Samma mönster som systerprojektens splash (statusrader som tickar in och bockas av, ikoner
// som rör sig, progress-stapel, Render-bricka) och samma ljusa kort som Bankomatens, men i
// elitrobban.se:s gröna och persika. Överst en SCEN i två akter som följer raderna:
//   1. bokhyllan — böckerna glider ned på hyllan, och en av dem lånas ut och lämnas tillbaka,
//   2. budgeten — sedlar singlar ned, myntstaplarna växer och kontokortet visar saldot.
//
// REGLERNA, samma som de andra:
//   · en gång per FLIK (sessionStorage) — ?splash=1 tvingar fram den, window.jlReplaySplash()
//     gör det från konsolen,
//   · den släpper på DATAN, inte på sin egen speltid: index.html skickar 'labbar-redo' när
//     programmet skrivit sin första rad (eller misslyckats — ett fel är också ett slut på
//     väntan). Taket MAX_VANTA_MS gör att den aldrig kan låsa sidan,
//   · siffrorna kommer ur /api/info. Saknas de visas raden UTAN tal, aldrig med påhittade.
//
// Kallstarten syns INTE här: sidan ligger på samma sovande tjänst som splashen. Den väntan
// bärs av texten under ramen i WordPress-blocket (wordpress-embed.html).
(function () {
  'use strict';

  var FORCE  = /[?&]splash=1/.test(location.search);
  var NYCKEL = 'jl_splash_v1';
  var MAX_VANTA_MS = 9000;
  var ANIM_PCT = 92;   // stapeln når hit på animationen; 100 % först när programmet är igång
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function info() { return window.LABBAR_INFO || null; }
  function tal(n, dec) {
    return Number(n).toLocaleString('sv-SE', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }

  // `ic` ikonen, `an` dess rörelse, `tag` pillret, `fas` vilken akt i scenen raden hör till.
  // `tx(e)` bygger undertexten; e (0–1) räknar upp talen så de rullar fram.
  var ROWS = [
    { fas: 1, ic: '☕', t: 'Java', tag: 'STARTAD', an: 'kopp', tx: function () {
        var i = info();
        return i && i.java ? '<b>Java ' + String(i.java).split(/[+-]/)[0] + '</b> · en egen JVM per besökare' : 'en egen JVM per besökare';
      } },
    { fas: 1, ic: '📦', t: 'Källkoden', tag: 'GITHUB', an: 'paket', tx: function () {
        var i = info();
        if (!i || !i.bibliotek || !i.budget) return 'hämtad från labbrepona';
        return 'labb 1 @ <b>' + i.bibliotek.commit + '</b> · labb 2 @ <b>' + i.budget.commit + '</b>';
      } },
    { fas: 1, ic: '📚', t: 'Bibliotekshanteraren', tag: 'REDO', an: 'bok', tx: function () {
        return 'böcker · medlemmar · lån';
      } },
    { fas: 1, ic: '📖', t: 'Boklistan', an: 'blad', tx: function () {
        return 'arrayer som dubblas · bubble sort på titel';
      } },
    { fas: 1, ic: '👥', t: 'Medlemmar', an: 'folk', tx: function () {
        return 'högst <b>5</b> lån per medlem';
      } },
    { fas: 2, ic: '💵', t: 'Budgethanteraren', tag: 'REDO', an: 'sedel', tx: function () {
        return 'inkomster · utgifter · kategorier';
      } },
    { fas: 2, ic: '📄', t: 'transaktioner.csv', tag: 'LIVE', an: 'fil', raknas: true, tx: function (e) {
        var b = info() && info().budget;
        if (!b || b.rader == null) return 'exempelfilen läses in';
        return '<b>' + tal(b.rader * e) + '</b> transaktioner i exempelfilen';
      } },
    { fas: 2, ic: '💰', t: 'Saldo', tag: 'LIVE', an: 'mynt', raknas: true, tx: function (e) {
        var b = info() && info().budget;
        if (!b || b.saldo == null) return 'saldot summeras';
        return '<b>' + tal(b.saldo * e, 2) + ' kr</b> på kontot';
      } },
    { fas: 2, ic: '🧪', t: 'JUnit', tag: 'GRÖNT', an: 'kolv', tx: function () {
        return 'budgetens tester gick i bygget';
      } }
  ];
  var FAS2 = 5;   // index för första budgetraden — där byter scenen akt

  var BOOT1 = ['startar JVM:en…', 'hämtar labbarna från GitHub…', 'ställer böckerna på hyllan…'];
  var BOOT2 = ['räknar budgeten…'];

  var C = { gron: '#014932', gron2: '#395144', persika: '#FFEFEA', guld: '#c9a24a', text: '#14261d', dim: '#5d6f65' };

  function css() {
    if (document.getElementById('jl-splash-css')) return;
    var el = document.createElement('style');
    el.id = 'jl-splash-css';
    el.textContent = [
      '.jl-splash{position:fixed;inset:0;z-index:9999;overflow:auto;display:flex;align-items:flex-start;',
        'justify-content:center;padding:18px 14px;font-family:Hind,system-ui,sans-serif;color:' + C.text + ';',
        'background:radial-gradient(ellipse 85% 55% at 50% -12%,rgba(255,222,210,.75),transparent 70%),',
          'linear-gradient(180deg,#ffffff 0%,#fbf8f6 100%);',
        'opacity:1;transition:opacity .45s ease;}',
      '.jl-splash.jl-ut{opacity:0;}',
      '.jl-skort{position:relative;width:min(470px,100%);margin:0 auto;background:#fff;border-radius:18px;',
        'border:1px solid #e7ece9;padding:24px 22px 18px;',
        'box-shadow:0 1px 2px rgba(1,73,50,.06),0 18px 50px rgba(1,73,50,.13);',
        'animation:jl-in .5s cubic-bezier(.22,1,.36,1) both;}',
      '.jl-skort::before{content:"";position:absolute;left:22px;right:22px;top:0;height:3px;border-radius:0 0 3px 3px;',
        'background:linear-gradient(90deg,' + C.gron + ',' + C.gron2 + ' 55%,' + C.guld + ');}',
      '@keyframes jl-in{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}',
      '.jl-huvud{display:flex;align-items:center;gap:13px;}',
      '.jl-logo{flex-shrink:0;width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;',
        'background:linear-gradient(150deg,#0b6b4a,' + C.gron + ');box-shadow:0 6px 16px rgba(1,73,50,.28);}',
      '.jl-logo svg{width:28px;height:28px;}',
      '.jl-rubrik{font-size:1.2rem;font-weight:700;letter-spacing:-.2px;line-height:1.15;}',
      '.jl-under{font-size:.78rem;color:' + C.dim + ';margin-top:1px;}',

      // Scenen: två akter i samma ruta, som tonar över i varandra
      '.jl-scen{position:relative;height:116px;margin:14px 0 10px;border-radius:12px;overflow:hidden;',
        'background:linear-gradient(180deg,#fff7f3 0%,' + C.persika + ' 100%);border:1px solid #f6e2da;}',
      '.jl-scen svg{position:absolute;inset:0;width:100%;height:100%;transition:opacity .6s ease;}',
      '.jl-akt2{opacity:0;}',
      '.jl-splash.fas-2 .jl-akt1{opacity:0;}.jl-splash.fas-2 .jl-akt2{opacity:1;}',
      '.jl-scen g{transform-box:fill-box;transform-origin:50% 100%;}',
      // Akt 1: böckerna faller ned på hyllan, en i taget
      '.jl-bok{animation:jl-bok-in .55s cubic-bezier(.3,1.35,.5,1) var(--d,0s) both;}',
      '@keyframes jl-bok-in{from{opacity:0;transform:translateY(-80px) rotate(-6deg);}70%{opacity:1;}to{opacity:1;transform:none;}}',
      // ...och en av dem lånas ut och lämnas tillbaka, om och om igen
      '.jl-lan{animation:jl-lan 3.2s ease-in-out 2.4s infinite;}',
      '@keyframes jl-lan{0%{transform:translateY(0);}25%{transform:translateY(-22px) rotate(-4deg);}',
        '45%{transform:translateY(-26px) rotate(3deg);}70%{transform:translateY(-4px) rotate(0);}100%{transform:translateY(0);}}',
      '.jl-glans{animation:jl-glans 3.6s ease-in-out infinite;}',
      '@keyframes jl-glans{0%{transform:translateX(-80px);}100%{transform:translateX(380px);}}',
      // Akt 2: sedlar singlar ned, mynt staplas, kortet glider in
      '.jl-sedel{opacity:0;}',
      '.jl-splash.fas-2 .jl-sedel{animation:jl-sedel-in .9s cubic-bezier(.25,1,.4,1) var(--d,0s) both,',
        'jl-sedel-svav 3.4s ease-in-out calc(var(--d,0s) + .9s) infinite;}',
      '@keyframes jl-sedel-in{from{opacity:0;transform:translate(var(--x0,0),-90px) rotate(var(--r0,-20deg));}',
        'to{opacity:1;transform:rotate(var(--r,0deg));}}',
      '@keyframes jl-sedel-svav{0%,100%{transform:rotate(var(--r,0deg)) translateY(0);}',
        '50%{transform:rotate(calc(var(--r,0deg) + 3deg)) translateY(-3px);}}',
      '.jl-mynt{opacity:0;}',
      '.jl-splash.fas-2 .jl-mynt{animation:jl-mynt-in .35s cubic-bezier(.3,1.5,.5,1) var(--d,0s) both;}',
      '@keyframes jl-mynt-in{from{opacity:0;transform:translateY(-26px);}to{opacity:1;transform:none;}}',
      '.jl-topp{transform-origin:50% 50%!important;}',
      '.jl-splash.fas-2 .jl-topp{animation:jl-mynt-in .35s cubic-bezier(.3,1.5,.5,1) var(--d,0s) both,',
        'jl-snurr 2.4s ease-in-out calc(var(--d,0s) + .4s) infinite;}',
      '@keyframes jl-snurr{0%,100%{transform:scaleX(1);}50%{transform:scaleX(.18);}}',
      '.jl-konto{opacity:0;}',
      '.jl-splash.fas-2 .jl-konto{animation:jl-konto-in .7s cubic-bezier(.22,1,.36,1) .5s both,',
        'jl-konto-svav 3s ease-in-out 1.2s infinite;}',
      '@keyframes jl-konto-in{from{opacity:0;transform:translateX(60px) rotate(8deg);}to{opacity:1;transform:rotate(-4deg);}}',
      '@keyframes jl-konto-svav{0%,100%{transform:rotate(-4deg) translateY(0);}50%{transform:rotate(-2deg) translateY(-3px);}}',

      '.jl-boot{margin:0 0 10px;padding:7px 11px;border-radius:9px;background:#f6f8f7;border:1px solid #e8eeeb;',
        "font-family:ui-monospace,'Cascadia Code',Consolas,monospace;font-size:.72rem;color:#355045;min-height:1em;}",
      '.jl-boot .pr{color:' + C.gron + ';margin-right:6px;font-weight:700;}',
      '.jl-cur{display:inline-block;width:6px;height:.9em;background:' + C.gron + ';margin-left:2px;',
        'vertical-align:-1px;animation:jl-blink .9s ease-in-out infinite;}',
      '@keyframes jl-blink{0%,100%{opacity:1;}50%{opacity:.1;}}',
      '.jl-rader{display:flex;flex-direction:column;gap:5px;}',
      '.jl-srad{display:flex;align-items:center;gap:11px;padding:6px 10px;border-radius:10px;',
        'background:#fafcfb;border:1px solid #edf2ef;opacity:0;transform:translateY(6px);',
        'transition:opacity .3s ease,transform .3s ease,border-color .3s ease,background .3s ease;}',
      '.jl-srad.syns{opacity:1;transform:none;}',
      '.jl-srad.klar{border-color:#cfe7da;background:#f3faf6;}',
      '.jl-ic{flex-shrink:0;width:30px;height:30px;border-radius:8px;background:' + C.persika + ';',
        'display:flex;align-items:center;justify-content:center;font-size:.95rem;',
        'filter:grayscale(.6);opacity:.75;transition:filter .45s ease,opacity .45s ease,background .45s ease;}',
      '.jl-ic span{display:inline-block;animation:jl-vilar 3s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-vilar{0%,100%{transform:translateY(0) scale(.96);}50%{transform:translateY(-1.5px) scale(1);}}',
      '.jl-srad.klar .jl-ic{opacity:1;filter:none;background:#e3f3ea;}',
      // Glöden i drop-shadow, inte text-shadow: WordPress byter emoji mot <img> på sidor som
      // laddar wp-emoji, och text-shadow biter inte på en bild. Här är det en egen sida, men
      // samma regel som i de andra splasharna.
      '.jl-srad.klar .jl-ic span{filter:drop-shadow(0 1px 3px rgba(1,73,50,.35));}',
      '.jl-srad.klar .jl-i-kopp span{animation:jl-kopp 2.6s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-kopp{0%,100%{transform:rotate(-6deg);}40%{transform:rotate(6deg) translateY(-1.5px);}70%{transform:rotate(-2deg);}}',
      '.jl-srad.klar .jl-i-paket span{animation:jl-paket 2.4s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-paket{0%,100%{transform:translateY(0) scale(1);}30%{transform:translateY(-3px) scale(1.06);}60%{transform:translateY(1px) scale(.97);}}',
      '.jl-srad.klar .jl-i-bok span{animation:jl-ibok 2.8s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-ibok{0%,100%{transform:rotate(0) translateX(0);}30%{transform:rotate(-8deg) translateX(-1px);}65%{transform:rotate(5deg) translateX(1px);}}',
      '.jl-srad.klar .jl-i-blad span{animation:jl-blad 2.2s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-blad{0%,100%{transform:perspective(60px) rotateY(0);}35%{transform:perspective(60px) rotateY(-28deg);}70%{transform:perspective(60px) rotateY(14deg);}}',
      '.jl-srad.klar .jl-i-folk span{animation:jl-folk 2.6s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-folk{0%,100%{transform:translateX(-1.5px) scale(1);}50%{transform:translateX(1.5px) scale(1.07);}}',
      '.jl-srad.klar .jl-i-sedel span{animation:jl-isedel 2.8s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-isedel{0%,100%{transform:translateY(1px) rotate(-6deg);}50%{transform:translateY(-2.5px) rotate(7deg);}}',
      '.jl-srad.klar .jl-i-fil span{animation:jl-fil 2.4s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-fil{0%,100%{transform:translateY(0) rotate(0);}35%{transform:translateY(-2px) rotate(-5deg);}70%{transform:translateY(1px) rotate(3deg);}}',
      '.jl-srad.klar .jl-i-mynt span{animation:jl-imynt 3s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-imynt{0%{transform:perspective(60px) rotateY(0);}30%{transform:perspective(60px) rotateY(-20deg);}',
        '60%{transform:perspective(60px) rotateY(180deg);}100%{transform:perspective(60px) rotateY(360deg);}}',
      '.jl-srad.klar .jl-i-kolv span{animation:jl-kolv 2.2s ease-in-out var(--ikd,0s) infinite;}',
      '@keyframes jl-kolv{0%,100%{transform:rotate(-10deg);}50%{transform:rotate(10deg) translateY(-1px);}}',
      '.jl-tx{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25;}',
      '.jl-tx>b{font-size:.84rem;font-weight:600;display:flex;align-items:center;gap:7px;}',
      '.jl-tx i{font-size:.74rem;font-style:normal;color:' + C.dim + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.jl-tx i b{color:' + C.gron + ';font-weight:700;}',
      '.jl-pill{font-size:.54rem;font-weight:700;letter-spacing:.8px;padding:1px 6px;border-radius:20px;',
        'background:#e7f4ec;color:#15803d;border:1px solid #c9ebd7;}',
      '.jl-pill.p-GITHUB{background:#f1f1f4;color:#33343d;border-color:#dedfe6;}',
      '.jl-pill.p-LIVE{background:#fff1e8;color:#b4531f;border-color:#fbd9c4;}',
      '.jl-st{flex-shrink:0;width:20px;height:20px;display:flex;align-items:center;justify-content:center;}',
      '.jl-snurra{width:14px;height:14px;border-radius:50%;border:2px solid #dcebe3;',
        'border-top-color:' + C.gron + ';animation:jl-snurra .6s linear infinite;}',
      '@keyframes jl-snurra{to{transform:rotate(360deg);}}',
      '.jl-check{width:20px;height:20px;border-radius:50%;background:#16a34a;color:#fff;font-size:.68rem;font-weight:800;',
        'display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(22,163,74,.3);',
        'animation:jl-pop .32s cubic-bezier(.22,1,.36,1);}',
      '@keyframes jl-pop{0%{transform:scale(.4);opacity:0;}60%{transform:scale(1.15);}100%{transform:scale(1);opacity:1;}}',
      '.jl-stapel{margin-top:14px;height:5px;border-radius:5px;background:#e8efeb;overflow:hidden;}',
      '.jl-fyll{height:100%;width:0;border-radius:5px;background:linear-gradient(90deg,' + C.gron + ',' + C.guld + ');',
        'transition:width .32s ease;}',
      '.jl-fot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:9px;font-size:.68rem;color:#7b8b83;}',
      '.jl-fot .jl-pct{font-variant-numeric:tabular-nums;color:' + C.gron + ';font-weight:700;}',
      '.jl-render{display:inline-flex;align-items:center;gap:7px;min-width:0;padding:3px 10px 3px 4px;border-radius:20px;',
        'background:#f3f0ff;border:1px solid #e0d7fe;color:#4c3d8f;}',
      '.jl-render b{color:#3b2a8a;font-weight:700;}',
      '.jl-render i{font-style:normal;font-family:ui-monospace,Consolas,monospace;color:#6d5bd0;white-space:nowrap;}',
      '.rd-logo{display:block;flex-shrink:0;border-radius:6px;box-shadow:0 2px 8px rgba(99,102,241,.35);}',
      '.rd-pil{animation:rd-lyft 1.6s cubic-bezier(.4,0,.2,1) infinite;}',
      '@keyframes rd-lyft{0%{transform:translateY(2px);opacity:.3;}45%{transform:translateY(-1px);opacity:1;}100%{transform:translateY(-3px);opacity:0;}}',
      '.jl-hoppa{position:fixed;top:12px;right:14px;z-index:3;background:#fff;border:1px solid #d9e3de;',
        'color:#355045;border-radius:20px;cursor:pointer;font-family:inherit;font-size:.74rem;font-weight:600;',
        'padding:5px 13px;box-shadow:0 2px 8px rgba(1,73,50,.08);}',
      '.jl-hoppa:hover{border-color:' + C.gron + ';color:' + C.gron + ';}',
      '.jl-splash.jl-redo .jl-boot{color:#15803d;}',
      '.jl-splash.jl-redo .jl-fyll{background:linear-gradient(90deg,#16a34a,#15803d);}',
      // Smal skärm: luft ovanför kortet så att Hoppa över-knappen inte ligger på rubriken
      '@media (max-width:520px){.jl-splash{padding-top:52px;}.jl-skort{padding:22px 14px 15px;border-radius:16px;}.jl-scen{height:100px;}',
        '.jl-srad{padding:6px 9px;}.jl-ic{width:27px;height:27px;}.jl-render span{display:none;}}',
      '@media (prefers-reduced-motion:reduce){.jl-splash *{animation:none!important;transition:none!important;}',
        '.jl-splash .jl-sedel,.jl-splash .jl-mynt,.jl-splash .jl-konto{opacity:1;}}'
    ].join('');
    document.head.appendChild(el);
  }

  // Loggan: en bok och ett mynt — de två labbarna.
  var LOGO =
    '<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 6.5c2.6-1.3 5.6-1.3 8 .2v15c-2.4-1.5-5.4-1.5-8-.2v-15Z" fill="#fff"/>' +
      '<path d="M12 6.7c2.4-1.5 5.4-1.5 8-.2v6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="19.5" cy="19" r="5.2" fill="' + C.guld + '" stroke="#fff" stroke-width="1.3"/>' +
      '<path d="M19.5 16.4v5.2M17.9 17.6c.5-.6 2.9-.8 3 .4.1 1.3-3.1.9-3.1 2.3 0 1.1 2.4 1 3.2.3" stroke="#fff" stroke-width="1" stroke-linecap="round"/>' +
    '</svg>';

  // Akt 1: hylla med böcker. Bredd, höjd och färg per bok; index LAN är boken som lånas ut.
  var BOCKER = [
    [16, 62, '#014932'], [12, 54, '#c9a24a'], [18, 70, '#b5523b'], [14, 58, '#2f6f8f'], [20, 66, '#395144'],
    [13, 50, '#7a4e8c'], [17, 72, '#d98c5f'], [15, 60, '#4f7a3a'], [19, 64, '#a33b3b'], [12, 56, '#2c4a6e'],
    [16, 68, '#8a6a2f'], [14, 52, '#0b6b4a']
  ];
  var LAN = 6;
  function akt1() {
    var x = 46, hylla = 94, s = '';
    BOCKER.forEach(function (b, i) {
      var w = b[0], h = b[1], y = hylla - h;
      s += '<g class="jl-bok" style="--d:' + (0.15 + i * 0.13).toFixed(2) + 's">' +
        '<g' + (i === LAN ? ' class="jl-lan"' : '') + '>' +
          '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2" fill="' + b[2] + '"/>' +
          '<rect x="' + (x + 2) + '" y="' + (y + 7) + '" width="' + (w - 4) + '" height="2" fill="rgba(255,255,255,.55)"/>' +
          '<rect x="' + (x + 2) + '" y="' + (y + h - 10) + '" width="' + (w - 4) + '" height="2" fill="rgba(255,255,255,.55)"/>' +
          '<rect x="' + (x + 3) + '" y="' + (y + 16) + '" width="' + (w - 6) + '" height="' + Math.round(h * 0.28) + '" rx="1" fill="rgba(255,255,255,.18)"/>' +
        '</g></g>';
      x += w + 2;
    });
    return '<svg class="jl-akt1" viewBox="0 0 330 116" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<defs><linearGradient id="jlGlans" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/>' +
        '<stop offset=".5" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      // bokstöd
      '<path d="M36 94V54l8 4v36Z" fill="#c9a24a" opacity=".85"/>' +
      '<path d="M' + (x + 4) + ' 94V54l-8 4v36Z" fill="#c9a24a" opacity=".85"/>' +
      s +
      // hyllplanet med skugga
      '<rect x="24" y="94" width="282" height="8" rx="2" fill="#8a5a3b"/>' +
      '<rect x="24" y="94" width="282" height="2.5" rx="1" fill="#a87250"/>' +
      '<rect x="30" y="102" width="270" height="5" rx="2" fill="rgba(90,50,30,.12)"/>' +
      '<rect class="jl-glans" x="0" y="20" width="40" height="74" fill="url(#jlGlans)" opacity=".7"/>' +
    '</svg>';
  }

  // Akt 2: sedlar, myntstaplar och kontokortet med saldot.
  function sedel(x, y, r, x0, r0, d, valor, farg) {
    return '<g class="jl-sedel" style="--d:' + d + 's;--r:' + r + 'deg;--x0:' + x0 + 'px;--r0:' + r0 + 'deg">' +
      '<rect x="' + x + '" y="' + y + '" width="78" height="38" rx="3" fill="' + farg + '"/>' +
      '<rect x="' + (x + 3) + '" y="' + (y + 3) + '" width="72" height="32" rx="2" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1"/>' +
      '<circle cx="' + (x + 22) + '" cy="' + (y + 19) + '" r="9" fill="rgba(255,255,255,.22)" stroke="rgba(255,255,255,.5)"/>' +
      '<text x="' + (x + 70) + '" y="' + (y + 25) + '" text-anchor="end" font-family="Hind,system-ui,sans-serif" font-weight="700" font-size="13" fill="#fff">' + valor + '</text>' +
    '</g>';
  }
  function stapel(cx, n, d0) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var y = 96 - i * 6, sista = i === n - 1;
      s += '<g class="jl-mynt' + (sista ? ' jl-topp' : '') + '" style="--d:' + (d0 + i * 0.12).toFixed(2) + 's">' +
        '<ellipse cx="' + cx + '" cy="' + (y + 2) + '" rx="13" ry="4.5" fill="#a8812f"/>' +
        '<ellipse cx="' + cx + '" cy="' + y + '" rx="13" ry="4.5" fill="' + C.guld + '"/>' +
        (sista ? '<text x="' + cx + '" y="' + (y + 2.6) + '" text-anchor="middle" font-family="Hind,system-ui,sans-serif" font-weight="700" font-size="6" fill="#6b5420">kr</text>' : '') +
      '</g>';
    }
    return s;
  }
  function akt2() {
    return '<svg class="jl-akt2" viewBox="0 0 330 116" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<rect x="20" y="104" width="290" height="4" rx="2" fill="rgba(90,50,30,.10)"/>' +
      sedel(30, 50, -8, -30, -40, '0.05', '500', '#7a4e8c') +
      sedel(46, 42, 4, 20, 30, '0.25', '100', '#2f7d4f') +
      sedel(62, 56, -3, -10, -25, '0.45', '200', '#2f6f8f') +
      stapel(168, 6, 0.7) + stapel(198, 9, 0.9) + stapel(228, 4, 1.1) +
      '<g class="jl-konto">' +
        '<rect x="246" y="38" width="70" height="46" rx="6" fill="' + C.gron + '"/>' +
        '<rect x="252" y="46" width="12" height="9" rx="2" fill="' + C.guld + '"/>' +
        '<text x="310" y="54" text-anchor="end" font-family="Hind,system-ui,sans-serif" font-size="7" fill="rgba(255,255,255,.75)">KONTO</text>' +
        '<text class="jl-saldo" x="310" y="74" text-anchor="end" font-family="Hind,system-ui,sans-serif" font-weight="700" font-size="9" fill="#fff"></text>' +
      '</g>' +
    '</svg>';
  }

  function renderLogo(id) {
    return '<svg class="rd-logo" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs>' +
      '<rect width="24" height="24" rx="6" fill="url(#' + id + ')"/>' +
      '<path d="M7.6 17h8.8a3.1 3.1 0 0 0 .5-6.15A4.6 4.6 0 0 0 8.1 9.7 3.6 3.6 0 0 0 7.6 17Z" fill="rgba(255,255,255,.22)" stroke="#fff" stroke-width="1.2"/>' +
      '<path class="rd-pil" d="M12 15.4v-4.6m0 0-2 2m2-2 2 2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
    '</svg>';
  }
  function deployText() {
    var i = info();
    return i && i.deploy ? 'main · ' + i.deploy : 'GitHub → main';
  }

  function radHtml(r, i) {
    return '<div class="jl-srad" style="--ikd:' + (i * 0.11).toFixed(2) + 's">' +
      '<span class="jl-ic jl-i-' + r.an + '"><span>' + r.ic + '</span></span>' +
      '<span class="jl-tx"><b>' + r.t + (r.tag ? '<span class="jl-pill p-' + r.tag + '">' + r.tag + '</span>' : '') + '</b>' +
      '<i class="jl-sub">' + r.tx(r.raknas ? 0 : 1) + '</i></span>' +
      '<span class="jl-st"><span class="jl-snurra"></span></span>' +
    '</div>';
  }

  // Passar kortet i den SYNLIGA höjden — samma funktion som i Bankomatens, CarAdvices,
  // elbilsappens och VäderKläders splash (se kommentaren där). scale, inte transform.
  function passaHojd(lager, kort) {
    if (!lager || !kort) return;
    function passa() {
      if (!lager.isConnected) { window.removeEventListener('resize', passa); return; }
      var cs = getComputedStyle(lager);
      var ledig = lager.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var hojd = kort.offsetHeight;
      if (!ledig || !hojd || hojd <= ledig) { kort.style.scale = ''; lager.style.overflowY = ''; return; }
      var iToppen = kort.offsetTop >= parseFloat(cs.paddingTop) - 1;
      var s = Math.max(0.55, ledig / hojd);
      kort.style.transformOrigin = iToppen ? '50% 0' : '50% 50%';
      kort.style.scale = s.toFixed(4);
      lager.style.overflowY = s > 0.55 ? 'hidden' : '';
    }
    passa();
    window.addEventListener('resize', passa);
    if (window.ResizeObserver) new ResizeObserver(passa).observe(kort);
  }

  function kor() {
    css();
    var lager = document.createElement('div');
    lager.className = 'jl-splash';
    lager.innerHTML =
      '<button class="jl-hoppa" type="button">Hoppa över ✕</button>' +
      '<div class="jl-skort">' +
        '<div class="jl-huvud"><span class="jl-logo">' + LOGO + '</span>' +
          '<div><div class="jl-rubrik">Bibliotekshanteraren &amp; Budgethanteraren</div>' +
          '<div class="jl-under">Labb 1 och 2 · Java-kursen · körs på riktigt</div></div></div>' +
        '<div class="jl-scen">' + akt1() + akt2() + '</div>' +
        '<p class="jl-boot"><span class="pr">›</span><span class="jl-boot-tx"></span><span class="jl-cur"></span></p>' +
        '<div class="jl-rader">' + ROWS.map(radHtml).join('') + '</div>' +
        '<div class="jl-stapel"><div class="jl-fyll"></div></div>' +
        '<div class="jl-fot"><span class="jl-render">' + renderLogo('jlRd') +
          '<span>Autodeploy via <b>Render</b></span><i class="jl-deploy">' + deployText() + '</i></span>' +
          '<span class="jl-pct">0 %</span></div>' +
      '</div>';
    document.body.appendChild(lager);
    passaHojd(lager, lager.querySelector('.jl-skort'));

    var fyll   = lager.querySelector('.jl-fyll');
    var pct    = lager.querySelector('.jl-pct');
    var bootEl = lager.querySelector('.jl-boot-tx');
    var saldo  = lager.querySelector('.jl-saldo');
    var rader  = lager.querySelectorAll('.jl-srad');
    var timers = [];
    var klar   = false;
    var animKlar = false;

    function satt(p) {
      if (fyll) fyll.style.width = Math.round(p) + '%';
      if (pct) pct.textContent = Math.round(p) + ' %';
    }
    function bocka(rad) {
      rad.classList.add('syns', 'klar');
      rad.querySelector('.jl-st').innerHTML = '<span class="jl-check">✓</span>';
    }
    function sattSaldo(e) {
      var b = info() && info().budget;
      if (saldo) saldo.textContent = b && b.saldo != null ? tal(b.saldo * e, 2) + ' kr' : '';
    }
    function rakna(i) {
      var r = ROWS[i], el = rader[i].querySelector('.jl-sub');
      if (!r.raknas) { el.innerHTML = r.tx(1); return; }
      if (reduce) { el.innerHTML = r.tx(1); if (r.an === 'mynt') sattSaldo(1); return; }
      var start = performance.now();
      (function steg(nu) {
        var p = Math.min(1, (nu - start) / 1000), e = 1 - Math.pow(1 - p, 3);
        el.innerHTML = r.tx(e);
        if (r.an === 'mynt') sattSaldo(e);
        if (p < 1 && el.isConnected) requestAnimationFrame(steg);
      })(start);
    }

    // Kommer /api/info efter att raderna redan visats skrivs deras text om — med talen.
    function nyInfo() {
      var d = lager.querySelector('.jl-deploy');
      if (d) d.textContent = deployText();
      rader.forEach(function (rad, i) { if (rad.classList.contains('syns')) rakna(i); });
    }
    window.addEventListener('labbar-info', nyInfo);

    var forraOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    // Varje ny text tar över raden: den förra skrivmaskinen ser att den inte längre är
    // den senaste och slutar, annars skriver två i kapp vid aktbytet.
    var skrivNr = 0;
    function skriv(rader2) {
      var rad = 0, tecken = 0, mitt = ++skrivNr;
      (function steg() {
        if (mitt !== skrivNr || rad >= rader2.length || !bootEl.isConnected || klar) return;
        var txt = rader2[rad];
        bootEl.textContent = txt.slice(0, ++tecken);
        if (tecken >= txt.length) {
          rad++; tecken = 0;
          if (rad < rader2.length) timers.push(setTimeout(steg, 650));
        } else {
          timers.push(setTimeout(steg, 22));
        }
      })();
    }

    function finish() {
      if (klar) return;
      klar = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('labbar-info', nyInfo);
      window.removeEventListener('labbar-redo', narRedo);
      rader.forEach(function (rad, i) { if (!rad.classList.contains('klar')) { bocka(rad); rakna(i); } });
      lager.classList.add('fas-2', 'jl-redo');
      satt(100);
      skrivNr++;
      bootEl.textContent = 'Klar — välj ett program';
      var cur = lager.querySelector('.jl-cur');
      if (cur) cur.style.display = 'none';
      document.documentElement.style.overflow = forraOverflow;
      try { sessionStorage.setItem(NYCKEL, '1'); } catch (e) {}
      setTimeout(function () {
        lager.classList.add('jl-ut');
        setTimeout(function () { if (lager.parentNode) lager.parentNode.removeChild(lager); }, 480);
      }, 900);
    }

    // Animationen är slut — men lagret släpper först när programmet skrivit sin meny.
    function slutfor() {
      animKlar = true;
      if (window.LABBAR_REDO) { finish(); return; }
      skrivNr++;
      bootEl.textContent = 'väntar på att programmet startar…';
      timers.push(setTimeout(finish, MAX_VANTA_MS));
    }
    function narRedo() { if (animKlar) finish(); }
    window.addEventListener('labbar-redo', narRedo);

    lager.querySelector('.jl-hoppa').addEventListener('click', finish);

    if (reduce) {
      rader.forEach(function (rad, i) { bocka(rad); rakna(i); });
      lager.classList.add('fas-2');
      satt(ANIM_PCT);
      timers.push(setTimeout(slutfor, 1400));
      return;
    }

    skriv(BOOT1);
    // ~4,7 s: nio rader, scenen byter akt vid den första budgetraden.
    var START = 300, STEG = 430, VAND = 250;
    rader.forEach(function (rad, i) {
      var nar = START + i * STEG + (i >= FAS2 ? 350 : 0);
      if (i === FAS2) {
        timers.push(setTimeout(function () { lager.classList.add('fas-2'); skriv(BOOT2); }, nar - 350));
      }
      timers.push(setTimeout(function () { rad.classList.add('syns'); rakna(i); }, nar));
      timers.push(setTimeout(function () {
        bocka(rad);
        satt((i + 1) / rader.length * ANIM_PCT);
        if (i === rader.length - 1) timers.push(setTimeout(slutfor, 450));
      }, nar + VAND));
    });
  }

  function borVisas() {
    if (FORCE) return true;
    try { return sessionStorage.getItem(NYCKEL) !== '1'; } catch (e) { return true; }
  }

  window.jlReplaySplash = function () {
    try { sessionStorage.removeItem(NYCKEL); } catch (e) {}
    kor();
  };

  if (borVisas()) {
    if (document.body) kor();
    else document.addEventListener('DOMContentLoaded', kor);
  }
})();
