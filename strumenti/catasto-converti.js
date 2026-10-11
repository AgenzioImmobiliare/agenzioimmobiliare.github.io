/* strumenti/catasto-converti.js — [11 ott 2026]
   ----------------------------------------------------------------------------
   Trasforma i file GML della cartografia catastale dell'Agenzia delle Entrate
   (download regionale, un ZIP per comune con *_ple.gml = particelle e
   *_map.gml = fogli) nei file leggeri che la Mappa catastale disegna.

   È UN SOLO convertitore, usato in due posti:
   · dalla pagina strumenti/aggiorna-catasto.html, nel browser, ogni sei mesi;
   · da Node, la prima volta (stesso codice, stessi risultati).

   FORMATO PRODOTTO (cartella catasto/ del sito)
   · catasto/indice.json          → elenco dei comuni, con il loro riquadro;
   · catasto/<COD>/fogli.json     → i fogli di un comune: numero, riquadro, confine;
   · catasto/<COD>/<FOGLIO>.json  → le particelle di un foglio.
   Le coordinate sono numeri interi in milionesimi di grado (circa 10 cm),
   scritti come differenza dal punto precedente: è questo che rende i file
   sette-otto volte più piccoli del GML, senza semplificare i confini.
   Un anello di coordinate = [dLat, dLon, dLat, dLon, ...]; il primo punto è
   relativo all'origine "o" del file.
   Particella = [numero, [anelli], [indici degli anelli che sono buchi]].

   Licenza dei dati: CC BY 4.0, fonte Agenzia delle Entrate. Va citata.
   ---------------------------------------------------------------------------- */
(function (radice) {
  'use strict';
  var Q = 1e6;               // milionesimi di grado
  var VERSIONE_FORMATO = 1;

  function _tra(s, da, a, inizio) {
    var i = s.indexOf(da, inizio || 0);
    if (i < 0) return null;
    var j = s.indexOf(a, i + da.length);
    if (j < 0) return null;
    return { testo: s.slice(i + da.length, j), fine: j + a.length };
  }
  function _campo(blocco, tag) {
    var r = _tra(blocco, '<CP:' + tag + '>', '</CP:' + tag + '>');
    return r ? r.testo.trim() : '';
  }

  /* Gli anelli di una forma, nell'ordine in cui compaiono, con il segno
     "buco" per gli interni. Regge sia Polygon sia MultiSurface. */
  function _anelli(blocco) {
    var out = [], pos = 0;
    while (true) {
      var iE = blocco.indexOf('<gml:exterior>', pos);
      var iI = blocco.indexOf('<gml:interior>', pos);
      if (iE < 0 && iI < 0) break;
      var buco = (iI >= 0 && (iE < 0 || iI < iE));
      var da = buco ? iI : iE;
      var pl = _tra(blocco, '>', '</gml:posList>', blocco.indexOf('<gml:posList', da));
      if (!pl) break;
      var num = pl.testo.trim().split(/\s+/);
      var punti = [];
      for (var k = 0; k + 1 < num.length; k += 2) {
        var la = parseFloat(num[k]), lo = parseFloat(num[k + 1]);
        if (isFinite(la) && isFinite(lo)) punti.push([Math.round(la * Q), Math.round(lo * Q)]);
      }
      /* il GML ripete il primo punto in fondo: non serve */
      if (punti.length > 1) {
        var a = punti[0], z = punti[punti.length - 1];
        if (a[0] === z[0] && a[1] === z[1]) punti.pop();
      }
      if (punti.length >= 3) out.push({ punti: punti, buco: buco });
      pos = pl.fine;
    }
    return out;
  }

  /* Tutti gli oggetti di un file GML, uno alla volta. */
  function _perOgni(testo, tag, fn) {
    var apre = '<CP:' + tag + ' ', chiude = '</CP:' + tag + '>';
    var pos = 0, n = 0;
    while (true) {
      var i = testo.indexOf(apre, pos);
      if (i < 0) break;
      var j = testo.indexOf(chiude, i);
      if (j < 0) break;
      fn(testo.slice(i, j));
      pos = j + chiude.length; n++;
    }
    return n;
  }

  function _codifica(anelli, o) {
    return anelli.map(function (a) {
      var out = [], pLa = o[0], pLo = o[1];
      a.punti.forEach(function (p) {
        var dLa = p[0] - pLa, dLo = p[1] - pLo;
        if (out.length && dLa === 0 && dLo === 0) return;   // punto doppio
        out.push(dLa, dLo); pLa = p[0]; pLo = p[1];
      });
      return out;
    });
  }
  function _riquadro(anelli, b) {
    b = b || [Infinity, Infinity, -Infinity, -Infinity];
    anelli.forEach(function (a) {
      a.punti.forEach(function (p) {
        if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1];
        if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1];
      });
    });
    return b;
  }
  function _dataFile(testo) {
    var m = /timeStamp="(\d{4}-\d{2}-\d{2})/.exec(testo.slice(0, 3000));
    return m ? m[1] : '';
  }
  /* i nomi nei file dell'Agenzia sono quelli brevi del catasto */
  var NOMI_UFFICIALI = { B644: 'Capaccio Paestum' };
  function _nomeBello(nome, codice) {
    if (codice && NOMI_UFFICIALI[codice]) return NOMI_UFFICIALI[codice];
    return String(nome || '').toLowerCase()
      .replace(/(^|[\s'-])([a-zàèéìòù])/g, function (_, a, b) { return a + b.toUpperCase(); })
      .replace(/ (Di|Del|Della|Dei|Delle|Sul|Sulla|In|Al|Alla) /g, function (x) { return x.toLowerCase(); });
  }
  /* "A091_004300" → foglio 43; allegato e sviluppo a parte */
  function _foglioDaCodice(cod) {
    var m = /^[A-Z]\d{3}_(\d{4})([0-9A-Z])([0-9A-Z])$/.exec(cod);
    if (!m) return null;
    return { num: String(parseInt(m[1], 10)), all: m[2] === '0' ? '' : m[2], svi: m[3] === '0' ? '' : m[3] };
  }

  /* IL CUORE: un comune → i suoi file.
     codice 'A091', nome 'AGROPOLI', testoPle e testoMap = contenuto dei due GML. */
  function convertiComune(codice, nome, testoPle, testoMap) {
    var fogli = {};           // id foglio (6 caratteri) → dati
    var avvisi = [];
    function foglio(id) {
      if (!fogli[id]) fogli[id] = { id: id, l: '', s: 0, anelli: [], part: [], b: null };
      return fogli[id];
    }

    /* 1. i fogli col loro confine */
    _perOgni(testoMap || '', 'CadastralZoning', function (blk) {
      var rif = _campo(blk, 'NATIONALCADASTRALZONINGREFERENCE');
      var id = rif.split('_')[1];
      if (!id || id.length !== 6) return;
      var f = foglio(id);
      f.l = _campo(blk, 'LABEL') || '';
      f.s = parseInt(_campo(blk, 'ORIGINALMAPSCALEDENOMINATOR'), 10) || 0;
      f.anelli = _anelli(blk);
    });

    /* 2. le particelle, smistate per foglio */
    var nPart = 0, scartate = 0;
    _perOgni(testoPle || '', 'CadastralParcel', function (blk) {
      var rif = _campo(blk, 'NATIONALCADASTRALREFERENCE');     // A091_004300.120
      var m = /^([A-Z]\d{3})_([0-9A-Z]{6})\.(.+)$/.exec(rif);
      if (!m) { scartate++; return; }
      var an = _anelli(blk);
      if (!an.length) { scartate++; return; }
      foglio(m[2]).part.push({ n: m[3], anelli: an });
      nPart++;
    });
    if (scartate) avvisi.push(scartate + ' particelle senza forma o senza codice, saltate');

    /* 3. i file */
    var file = {}, elenco = [], bCom = null;
    Object.keys(fogli).sort().forEach(function (id) {
      var f = fogli[id];
      var b = f.anelli.length ? _riquadro(f.anelli) : null;
      f.part.forEach(function (p) { b = _riquadro(p.anelli, b); });
      if (!b || !isFinite(b[0])) return;
      bCom = _riquadro([{ punti: [[b[0], b[1]], [b[2], b[3]]] }], bCom);
      var o = [b[0], b[1]];
      var dec = _foglioDaCodice(codice + '_' + id) || { num: id, all: '', svi: '' };
      if (!f.l) f.l = dec.num + (dec.all ? '_' + dec.all : '') + (dec.svi ? '_' + dec.svi : '');
      if (f.part.length) {
        file[id + '.json'] = JSON.stringify({
          v: VERSIONE_FORMATO, c: codice, f: id, o: o,
          p: f.part.map(function (p) {
            var buchi = [];
            p.anelli.forEach(function (a, i) { if (a.buco) buchi.push(i); });
            var r = [p.n, _codifica(p.anelli, o)];
            if (buchi.length) r.push(buchi);
            return r;
          })
        });
      }
      elenco.push({
        id: id, l: f.l, num: dec.num, s: f.s, n: f.part.length,
        o: o, b: [b[0] / Q, b[1] / Q, b[2] / Q, b[3] / Q],
        r: _codifica(f.anelli, o)
      });
    });
    var data = _dataFile(testoPle || '') || _dataFile(testoMap || '');
    file['fogli.json'] = JSON.stringify({
      v: VERSIONE_FORMATO, c: codice, nome: _nomeBello(nome, codice), data: data, fogli: elenco
    });
    return {
      codice: codice, nome: _nomeBello(nome, codice), data: data, file: file, avvisi: avvisi,
      riassunto: {
        c: codice, nome: _nomeBello(nome, codice), data: data,
        b: bCom ? [bCom[0] / Q, bCom[1] / Q, bCom[2] / Q, bCom[3] / Q] : null,
        fogli: elenco.length, particelle: nPart
      }
    };
  }

  /* L'indice di tutti i comuni: i nuovi sostituiscono i vecchi con lo stesso
     codice, gli altri restano. Così si può aggiornare anche un comune solo. */
  function componiIndice(vecchio, nuovi) {
    var per = {};
    ((vecchio && vecchio.comuni) || []).forEach(function (c) { per[c.c] = c; });
    (nuovi || []).forEach(function (c) { per[c.c] = c; });
    return JSON.stringify({
      v: VERSIONE_FORMATO,
      fonte: 'Agenzia delle Entrate — Cartografia catastale (CC BY 4.0)',
      generato: new Date().toISOString(),
      comuni: Object.keys(per).sort().map(function (k) { return per[k]; })
    });
  }

  /* Dal nome dello ZIP o del GML: "A091_AGROPOLI.zip" → A091, AGROPOLI */
  function leggiNome(nomeFile) {
    var base = String(nomeFile || '').split(/[\\/]/).pop().replace(/\.(zip|gml)$/i, '').replace(/_(ple|map)$/i, '');
    var m = /^([A-Z]\d{3})_(.+)$/i.exec(base);
    return m ? { codice: m[1].toUpperCase(), nome: m[2].replace(/_/g, ' ').trim() } : null;
  }

  var api = { convertiComune: convertiComune, componiIndice: componiIndice, leggiNome: leggiNome, Q: Q, VERSIONE_FORMATO: VERSIONE_FORMATO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else radice.CatastoConverti = api;
})(typeof self !== 'undefined' ? self : this);
