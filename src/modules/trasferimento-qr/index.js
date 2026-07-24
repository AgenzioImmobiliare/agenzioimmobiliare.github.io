/* ═══════════════════════════════════════════════════════════════════════
   src/modules/trasferimento-qr/index.js
   Trasferimento veloce dati + foto da TELEFONO a PC via QR code.
   ---------------------------------------------------------------------
   Come funziona (nessun dato passa da Firebase):
   - Il telefono e il PC si "agganciano" tramite il Worker Cloudflare
     esistente (stesso Worker di callClaude, endpoint /signal/...): vi
     transita solo un piccolo messaggio tecnico (offerta/risposta WebRTC),
     non i dati dell'annuncio né le foto.
   - Una volta agganciati, dati testuali e foto viaggiano DIRETTAMENTE dal
     telefono al PC (WebRTC DataChannel), tipicamente sulla stessa rete WiFi.
   - Sul PC i dati vengono mostrati (con un pulsante "Copia tutto") e le
     foto si salvano in una cartella scelta ogni volta dall'utente.
   - Il modulo si registra su window (pattern Strangler Fig già in uso).
   ═══════════════════════════════════════════════════════════════════════ */

(function () {

  var CHUNK_SIZE = 16 * 1024;          // 16KB per blocco, sicuro per RTCDataChannel
  var BUFFER_HIGH = 262144;            // se il buffer supera questo, mettiamo in pausa l'invio
  var BUFFER_LOW  = 65536;             // e riprendiamo quando scende sotto questo
  var POLL_MS     = 1500;              // intervallo di polling del Worker
  var POLL_MAX_MS = 3 * 60 * 1000;     // rinuncia dopo 3 minuti di attesa

  /* ── Utilità icone SVG (stesso pattern usato altrove nel gestionale) ── */
  function tqIcon(d, size) {
    size = size || 18;
    var paths = d.split(' M').map(function (seg, i) { return '<path d="' + (i === 0 ? seg : 'M' + seg) + '"/>'; }).join('');
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;flex-shrink:0">' + paths + '</svg>';
  }

  /* ── Configurazione WebRTC / Worker ───────────────────────────────── */
  function tqSignalBase() {
    var cfg = (typeof aiGetConfig === 'function') ? aiGetConfig() : { url: '' };
    if (!cfg.url) return null;
    try { return new URL(cfg.url).origin; } catch (e) { return null; }
  }
  function tqRtcConfig() {
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }
  function tqCodiceStanza() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O/1/I, per leggerlo facilmente a mano
    var s = '';
    for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function tqSignalPut(room, kind, body) {
    var base = tqSignalBase();
    if (!base) return Promise.reject(new Error('Worker non configurato: apri Impostazioni AI e imposta l\'indirizzo del tuo Worker Cloudflare.'));
    return fetch(base + '/signal/' + room + '/' + kind, { method: 'PUT', body: body }).then(function (r) {
      if (!r.ok) throw new Error('Errore di rete verso il Worker (' + r.status + ')');
    });
  }
  function tqSignalGet(room, kind) {
    var base = tqSignalBase();
    if (!base) return Promise.reject(new Error('Worker non configurato: apri Impostazioni AI e imposta l\'indirizzo del tuo Worker Cloudflare.'));
    return fetch(base + '/signal/' + room + '/' + kind).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('Errore di rete verso il Worker (' + r.status + ')');
      return r.text();
    });
  }
  function tqAspettaIceCompleta(pc) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      function check() {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      }
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(function () { pc.removeEventListener('icegatheringstatechange', check); resolve(); }, 2500);
    });
  }

  /* ── Stato condiviso della sessione corrente (invio o ricezione) ──── */
  var tqStato = {};
  function tqReset() {
    if (tqStato.pollTimer) clearInterval(tqStato.pollTimer);
    if (tqStato.scanRAF) cancelAnimationFrame(tqStato.scanRAF);
    if (tqStato.scanStream) { try { tqStato.scanStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
    if (tqStato.pc) { try { tqStato.pc.close(); } catch (e) {} }
    tqStato = { foto: [], ricevute: [], campi: {} };
  }

  /* ── Render principale della sezione ──────────────────────────────── */
  window.renderTrasferimentoQR = function () {
    var el = document.getElementById('sec-trasferimento-qr');
    if (!el) return;
    tqReset();
    el.innerHTML = ''
      + '<div class="print-header"><div class="ph-wrap"><div class="ph-agency">Le case dalla A allo Z.io</div><div class="ph-line2"><span class="ph-agent">Agente: Vincenzo Carnicelli</span></div><div class="ph-section">Trasferimento Veloce (QR)</div></div></div>'
      + '<div style="max-width:720px;margin:0 auto;">'
      + '<h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px;font-size:1.15rem;font-weight:800;color:var(--text)">' + tqIcon('M3 11l19-9-9 19-2-8-8-2z') + ' Trasferimento Veloce da Telefono a PC</h2>'
      + '<p style="color:var(--text3);font-size:0.85rem;margin:0 0 18px;">Cattura un annuncio dal telefono mentre sei in giro, poi trasferiscilo qui con un QR: dati e foto arrivano direttamente, senza riscriverli.</p>'
      + '<div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">'
      + '  <button class="btn btn-outline" style="flex:1;min-width:220px" onclick="tqAvviaInvio()">' + tqIcon('M12 19V5 M5 12l7-7 7 7') + ' Sono al telefono: genera QR</button>'
      + '  <button class="btn btn-outline" style="flex:1;min-width:220px" onclick="tqAvviaRicezione()">' + tqIcon('M23 7l-7 5 7 5V7z M1 5h15v14H1z') + ' Sono al PC: scansiona QR</button>'
      + '</div>'
      + '<div id="tq-area"></div>'
      + '</div>';
  };

  /* ═══════════════════════════════════════════════════════════════════
     MODALITÀ TELEFONO — compila i dati, scatta le foto, genera il QR
     ═══════════════════════════════════════════════════════════════════ */
  window.tqAvviaInvio = function () {
    tqReset();
    var area = document.getElementById('tq-area');
    if (!area) return;
    area.innerHTML = ''
      + '<div class="frow fcol"><label class="flabel">Venditore</label><input class="finput" id="tq-venditore" placeholder="Nome e cognome"></div>'
      + '<div style="display:flex;gap:10px">'
      + '  <div class="frow fcol" style="flex:1"><label class="flabel">Zona</label><input class="finput" id="tq-zona" placeholder="Es. Agropoli centro"></div>'
      + '  <div class="frow fcol" style="flex:1"><label class="flabel">Telefono</label><input class="finput" id="tq-telefono" placeholder="Numero di telefono"></div>'
      + '</div>'
      + '<div style="display:flex;gap:10px">'
      + '  <div class="frow fcol" style="flex:1"><label class="flabel">Prezzo</label><input class="finput" id="tq-prezzo" placeholder="Es. 180.000 €"></div>'
      + '  <div class="frow fcol" style="flex:1"><label class="flabel">Mq</label><input class="finput" id="tq-mq" placeholder="Es. 90"></div>'
      + '</div>'
      + '<div class="frow fcol"><label class="flabel">Note</label><textarea class="finput" id="tq-note" rows="3" placeholder="Dettagli, condizioni, riferimenti dell\'annuncio…"></textarea></div>'
      + '<div class="frow fcol">'
      + '  <label class="flabel">Foto</label>'
      + '  <input type="file" id="tq-foto-input" accept="image/*" multiple capture="environment" style="margin-bottom:8px" onchange="tqAggiungiFoto(this.files)">'
      + '  <div id="tq-foto-lista" style="display:flex;gap:8px;flex-wrap:wrap"></div>'
      + '</div>'
      + '<button class="btn btn-primary" style="margin-top:8px;width:100%" onclick="tqGeneraQR()">' + tqIcon('M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z') + ' Genera QR</button>'
      + '<div id="tq-esito" style="margin-top:18px;text-align:center"></div>';
  };

  window.tqAggiungiFoto = function (files) {
    if (!tqStato.foto) tqStato.foto = [];
    Array.prototype.forEach.call(files, function (f) { tqStato.foto.push(f); });
    tqRidisegnaFotoLista();
  };
  window.tqRimuoviFoto = function (idx) {
    tqStato.foto.splice(idx, 1);
    tqRidisegnaFotoLista();
  };
  function tqRidisegnaFotoLista() {
    var cont = document.getElementById('tq-foto-lista');
    if (!cont) return;
    cont.innerHTML = tqStato.foto.map(function (f, i) {
      var url = URL.createObjectURL(f);
      return '<div style="position:relative;width:64px;height:64px">'
        + '<img src="' + url + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">'
        + '<button onclick="tqRimuoviFoto(' + i + ')" title="Rimuovi" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#DC2626;color:#fff;border:none;cursor:pointer;font-size:0.7rem;line-height:1">✕</button>'
        + '</div>';
    }).join('') || '<span style="font-size:0.78rem;color:var(--text4)">Nessuna foto aggiunta.</span>';
  }

  window.tqGeneraQR = function () {
    var esito = document.getElementById('tq-esito');
    var campi = {
      venditore: (document.getElementById('tq-venditore') || {}).value || '',
      zona: (document.getElementById('tq-zona') || {}).value || '',
      telefono: (document.getElementById('tq-telefono') || {}).value || '',
      prezzo: (document.getElementById('tq-prezzo') || {}).value || '',
      mq: (document.getElementById('tq-mq') || {}).value || '',
      note: (document.getElementById('tq-note') || {}).value || ''
    };
    if (!campi.venditore && !campi.zona && !campi.note) {
      if (typeof showToast === 'function') showToast('Compila almeno un campo prima di generare il QR', '', '#DC2626');
      return;
    }
    tqStato.campi = campi;
    if (esito) esito.innerHTML = '<span style="color:var(--text3);font-size:0.85rem">Preparazione del collegamento…</span>';

    var pc = new RTCPeerConnection(tqRtcConfig());
    var dc = pc.createDataChannel('tq');
    dc.binaryType = 'arraybuffer';
    tqStato.pc = pc;
    tqStato.dc = dc;

    dc.onopen = function () { tqInviaDati(dc); };

    pc.createOffer().then(function (offer) {
      return pc.setLocalDescription(offer);
    }).then(function () {
      return tqAspettaIceCompleta(pc);
    }).then(function () {
      var room = tqCodiceStanza();
      tqStato.room = room;
      return tqSignalPut(room, 'offer', pc.localDescription.sdp).then(function () {
        var dataUrl = (typeof qrDataUrl === 'function') ? qrDataUrl(room, 220) : null;
        if (esito) {
          esito.innerHTML = ''
            + (dataUrl ? '<img src="' + dataUrl + '" style="border-radius:12px;border:1px solid var(--border)">' : '')
            + '<div style="margin-top:10px;font-size:1.3rem;font-weight:800;letter-spacing:2px;color:var(--text)">' + room + '</div>'
            + '<div style="font-size:0.78rem;color:var(--text3);margin-top:4px">Inquadra questo QR sul PC, oppure digita il codice se il QR non si legge bene.</div>'
            + '<div id="tq-invio-stato" style="margin-top:14px;font-size:0.85rem;color:var(--text3)">In attesa che il PC si colleghi…</div>';
        }
        tqAvviaPollingAnswer(room, pc);
      });
    }).catch(function (err) {
      if (esito) esito.innerHTML = '<span style="color:#DC2626;font-size:0.85rem">Errore: ' + (err.message || err) + '</span>';
    });
  };

  function tqAvviaPollingAnswer(room, pc) {
    var scaduto = Date.now() + POLL_MAX_MS;
    tqStato.pollTimer = setInterval(function () {
      if (Date.now() > scaduto) {
        clearInterval(tqStato.pollTimer);
        var st = document.getElementById('tq-invio-stato');
        if (st) st.innerHTML = '<span style="color:#DC2626">Tempo scaduto: nessun PC si è collegato. Genera un nuovo QR.</span>';
        return;
      }
      tqSignalGet(room, 'answer').then(function (sdp) {
        if (!sdp) return;
        clearInterval(tqStato.pollTimer);
        pc.setRemoteDescription({ type: 'answer', sdp: sdp }).then(function () {
          var st = document.getElementById('tq-invio-stato');
          if (st) st.textContent = 'Collegato — invio dati in corso…';
        });
      }).catch(function () { /* riprova al prossimo giro */ });
    }, POLL_MS);
  }

  function tqInviaDati(dc) {
    var manifest = {
      tipo: 'dati',
      campi: tqStato.campi,
      foto: tqStato.foto.map(function (f) { return { nome: f.name, size: f.size, mime: f.type || 'image/jpeg' }; })
    };
    dc.send(JSON.stringify(manifest));
    var indice = 0;
    function prossimaFoto() {
      if (indice >= tqStato.foto.length) {
        dc.send(JSON.stringify({ tipo: 'fine' }));
        var st = document.getElementById('tq-invio-stato');
        if (st) st.innerHTML = '<span style="color:#15803D">✓ Trasferito con successo.</span>';
        return;
      }
      var file = tqStato.foto[indice];
      dc.send(JSON.stringify({ tipo: 'foto-inizio', indice: indice }));
      file.arrayBuffer().then(function (buf) {
        var offset = 0;
        function inviaBlocco() {
          while (offset < buf.byteLength) {
            if (dc.bufferedAmount > BUFFER_HIGH) {
              dc.onbufferedamountlow = function () {
                dc.onbufferedamountlow = null;
                inviaBlocco();
              };
              dc.bufferedAmountLowThreshold = BUFFER_LOW;
              return;
            }
            var fine = Math.min(offset + CHUNK_SIZE, buf.byteLength);
            dc.send(buf.slice(offset, fine));
            offset = fine;
          }
          dc.send(JSON.stringify({ tipo: 'foto-fine', indice: indice }));
          var st = document.getElementById('tq-invio-stato');
          if (st) st.textContent = 'Invio foto ' + (indice + 1) + ' di ' + tqStato.foto.length + '…';
          indice++;
          prossimaFoto();
        }
        inviaBlocco();
      });
    }
    prossimaFoto();
  }

  /* ═══════════════════════════════════════════════════════════════════
     MODALITÀ PC — scansiona il QR (o inserisci il codice) e ricevi
     ═══════════════════════════════════════════════════════════════════ */
  window.tqAvviaRicezione = function () {
    tqReset();
    var area = document.getElementById('tq-area');
    if (!area) return;
    area.innerHTML = ''
      + '<div style="text-align:center">'
      + '  <button class="btn btn-outline" onclick="tqAvviaScansione()">' + tqIcon('M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z') + ' Avvia webcam</button>'
      + '  <div style="margin:14px 0"><video id="tq-video" style="display:none;max-width:320px;border-radius:12px;border:1px solid var(--border)" playsinline></video></div>'
      + '  <canvas id="tq-canvas" style="display:none"></canvas>'
      + '  <div style="font-size:0.78rem;color:var(--text3);margin:10px 0">— oppure, se il QR non si legge bene —</div>'
      + '  <div style="display:flex;gap:8px;justify-content:center;max-width:320px;margin:0 auto">'
      + '    <input class="finput" id="tq-codice-manuale" placeholder="Codice a 6 caratteri" style="text-transform:uppercase;text-align:center;letter-spacing:2px">'
      + '    <button class="btn btn-outline btn-sm" onclick="tqConnettiCodice()">Connetti</button>'
      + '  </div>'
      + '</div>'
      + '<div id="tq-ric-stato" style="margin-top:16px;text-align:center;font-size:0.85rem;color:var(--text3)"></div>'
      + '<div id="tq-ric-risultato" style="margin-top:16px"></div>';
  };

  window.tqAvviaScansione = function () {
    var video = document.getElementById('tq-video');
    var canvas = document.getElementById('tq-canvas');
    if (typeof jsQR === 'undefined') {
      if (typeof showToast === 'function') showToast('Libreria di lettura QR non disponibile', '', '#DC2626');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
      tqStato.scanStream = stream;
      video.srcObject = stream;
      video.style.display = 'block';
      video.play();
      var ctx = canvas.getContext('2d');
      function tick() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var codice = jsQR(img.data, img.width, img.height);
          if (codice && codice.data) {
            if (tqStato.scanStream) tqStato.scanStream.getTracks().forEach(function (t) { t.stop(); });
            video.style.display = 'none';
            tqConnetti(codice.data.trim());
            return;
          }
        }
        tqStato.scanRAF = requestAnimationFrame(tick);
      }
      tqStato.scanRAF = requestAnimationFrame(tick);
    }).catch(function (err) {
      var st = document.getElementById('tq-ric-stato');
      if (st) st.innerHTML = '<span style="color:#DC2626">Impossibile accedere alla webcam: ' + err.message + '</span>';
    });
  };

  window.tqConnettiCodice = function () {
    var v = (document.getElementById('tq-codice-manuale') || {}).value || '';
    if (v.trim().length < 4) {
      if (typeof showToast === 'function') showToast('Inserisci il codice mostrato sul telefono', '', '#DC2626');
      return;
    }
    tqConnetti(v.trim().toUpperCase());
  };

  function tqConnetti(room) {
    var st = document.getElementById('tq-ric-stato');
    if (st) st.textContent = 'Collegamento in corso…';
    tqSignalGet(room, 'offer').then(function (sdp) {
      if (!sdp) { if (st) st.innerHTML = '<span style="color:#DC2626">Codice non trovato o scaduto. Genera un nuovo QR sul telefono.</span>'; return; }
      var pc = new RTCPeerConnection(tqRtcConfig());
      tqStato.pc = pc;
      pc.ondatachannel = function (ev) {
        var dc = ev.channel;
        dc.binaryType = 'arraybuffer';
        tqStato.dc = dc;
        tqRicezioneAscolta(dc);
      };
      pc.setRemoteDescription({ type: 'offer', sdp: sdp }).then(function () {
        return pc.createAnswer();
      }).then(function (answer) {
        return pc.setLocalDescription(answer);
      }).then(function () {
        return tqAspettaIceCompleta(pc);
      }).then(function () {
        return tqSignalPut(room, 'answer', pc.localDescription.sdp);
      }).then(function () {
        if (st) st.textContent = 'Collegato — in attesa dei dati dal telefono…';
      }).catch(function (err) {
        if (st) st.innerHTML = '<span style="color:#DC2626">Errore: ' + (err.message || err) + '</span>';
      });
    }).catch(function (err) {
      if (st) st.innerHTML = '<span style="color:#DC2626">Errore: ' + (err.message || err) + '</span>';
    });
  }

  function tqRicezioneAscolta(dc) {
    var fotoInCorso = null;   // {indice, chunks:[], nome, mime, size}
    var fotoRicevute = [];
    var manifest = null;
    var byteRicevuti = 0, byteTotali = 0;

    dc.onmessage = function (ev) {
      if (typeof ev.data === 'string') {
        var msg = JSON.parse(ev.data);
        if (msg.tipo === 'dati') {
          manifest = msg;
          byteTotali = (msg.foto || []).reduce(function (a, f) { return a + f.size; }, 0);
        } else if (msg.tipo === 'foto-inizio') {
          var meta = manifest.foto[msg.indice];
          fotoInCorso = { indice: msg.indice, chunks: [], nome: meta.nome, mime: meta.mime };
        } else if (msg.tipo === 'foto-fine') {
          var blob = new Blob(fotoInCorso.chunks, { type: fotoInCorso.mime });
          fotoRicevute[fotoInCorso.indice] = { nome: fotoInCorso.nome, blob: blob };
          fotoInCorso = null;
          tqAggiornaStatoRicezione(fotoRicevute.length, (manifest.foto || []).length);
        } else if (msg.tipo === 'fine') {
          tqMostraRisultato(manifest.campi, fotoRicevute);
        }
      } else {
        if (fotoInCorso) {
          fotoInCorso.chunks.push(ev.data);
          byteRicevuti += ev.data.byteLength;
          tqAggiornaStatoRicezione(null, null, byteRicevuti, byteTotali);
        }
      }
    };
  }

  function tqAggiornaStatoRicezione(fatte, totali, byteRicevuti, byteTotali) {
    var st = document.getElementById('tq-ric-stato');
    if (!st) return;
    if (byteTotali) {
      var pct = Math.round((byteRicevuti / byteTotali) * 100);
      st.textContent = 'Ricezione foto in corso… ' + pct + '%';
    } else if (totali) {
      st.textContent = 'Foto ricevute: ' + fatte + ' di ' + totali;
    }
  }

  function tqMostraRisultato(campi, foto) {
    var st = document.getElementById('tq-ric-stato');
    if (st) st.innerHTML = '<span style="color:#15803D">✓ Trasferimento completato.</span>';
    var testo = ''
      + 'Venditore: ' + (campi.venditore || '-') + '\n'
      + 'Zona: ' + (campi.zona || '-') + '\n'
      + 'Telefono: ' + (campi.telefono || '-') + '\n'
      + 'Prezzo: ' + (campi.prezzo || '-') + '\n'
      + 'Mq: ' + (campi.mq || '-') + '\n'
      + 'Note: ' + (campi.note || '-');
    tqStato.ultimoTesto = testo;
    tqStato.ultimeFoto = foto;

    var cont = document.getElementById('tq-ric-risultato');
    if (!cont) return;
    cont.innerHTML = ''
      + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;white-space:pre-line;font-size:0.88rem;color:var(--text)">' + testo.replace(/</g, '&lt;') + '</div>'
      + '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">'
      + '  <button class="btn btn-outline" style="flex:1;min-width:180px" onclick="tqCopiaTutto()">' + tqIcon('M9 9h10v10H9z M5 15H3V3h12v2') + ' Copia tutto</button>'
      + (foto.length ? '  <button class="btn btn-primary" style="flex:1;min-width:180px" onclick="tqSalvaFoto()">' + tqIcon('M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3') + ' Salva ' + foto.length + ' foto sul PC</button>' : '')
      + '</div>';
  }

  window.tqCopiaTutto = function () {
    if (!tqStato.ultimoTesto) return;
    navigator.clipboard.writeText(tqStato.ultimoTesto).then(function () {
      if (typeof showToast === 'function') showToast('Dati copiati negli appunti', '', '#15803D');
    });
  };

  window.tqSalvaFoto = async function () {
    var foto = tqStato.ultimeFoto || [];
    if (!foto.length) return;
    if (!window.showDirectoryPicker) {
      // Fallback per browser senza File System Access API: scarico ogni foto singolarmente
      foto.forEach(function (f) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(f.blob);
        a.download = f.nome;
        a.click();
      });
      return;
    }
    try {
      var dirHandle = await window.showDirectoryPicker();
      for (var i = 0; i < foto.length; i++) {
        var fileHandle = await dirHandle.getFileHandle(foto[i].nome, { create: true });
        var writable = await fileHandle.createWritable();
        await writable.write(foto[i].blob);
        await writable.close();
      }
      if (typeof showToast === 'function') showToast(foto.length + ' foto salvate nella cartella scelta', '', '#15803D');
    } catch (err) {
      if (err && err.name === 'AbortError') return; // utente ha annullato la scelta cartella
      if (typeof showToast === 'function') showToast('Errore nel salvataggio: ' + err.message, '', '#DC2626');
    }
  };

})();
