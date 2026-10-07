/* ══════════════════════════════════════════════════════════════════════
   CONNETTORE DEL GESTIONALE PER CLAUDE — sola lettura      [6 ott 2026]
   ----------------------------------------------------------------------
   Worker Cloudflare "connettore-gestionale". Parla il protocollo MCP
   (quello dei connettori di Claude) e risponde a domande come "chi devo
   richiamare oggi?" leggendo il gestionale su Firestore.

   SICUREZZA, in tre strati:
   1) l'indirizzo contiene un codice segreto lungo (SEGRETO): senza, 404;
   2) entra in Firestore con un utente dedicato (CONN_EMAIL/CONN_PASSWORD)
      a cui le regole permettono SOLO di leggere: anche se questo codice
      sbagliasse, il server rifiuterebbe ogni scrittura;
   3) espone solo clienti, immobili, visite e agenda: niente provvigioni,
      fatture, F24, bilancio.

   Variabili da impostare in Cloudflare (Settings → Variables and Secrets,
   tutte di tipo "Secret"):
     SEGRETO        codice lungo casuale (lo stesso che va nell'indirizzo)
     CONN_EMAIL     email dell'utente connettore in Firebase
     CONN_PASSWORD  sua password
     CARTELLA       cartella dei dati (oggi: usr_001)

   Chi richiamare e quali immobili sono fermi NON si calcola qui: lo decide
   il gestionale e lo scrive in users/<cartella>/claude/riepilogo (una sola
   verità). Qui si ricalcolano solo i giorni rispetto a oggi.
   ══════════════════════════════════════════════════════════════════════ */

const PROGETTO = 'agenzioimmobiliare';
const CHIAVE_PUBBLICA = 'AIzaSyAgljCpsbFVlpbJ1SCSEjPcfxrjBoP5dvM'; /* la stessa di index.html: è pubblica per natura */
const VERSIONE = '2026-10-07';
const FS = `https://firestore.googleapis.com/v1/projects/${PROGETTO}/databases/(default)/documents`;

/* ── accesso a Firebase (token valido un'ora, tenuto in memoria) ─────── */
let _token = null, _tokenScade = 0;
async function token(env) {
  if (_token && Date.now() < _tokenScade - 60000) return _token;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CHIAVE_PUBBLICA}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.CONN_EMAIL, password: env.CONN_PASSWORD, returnSecureToken: true })
  });
  const d = await r.json();
  if (!d.idToken) throw new Error('Accesso a Firebase rifiutato per l\'utente connettore: ' + ((d.error && d.error.message) || r.status));
  _token = d.idToken; _tokenScade = Date.now() + (parseInt(d.expiresIn || '3600') * 1000);
  return _token;
}

/* valore Firestore (formato REST) → valore JavaScript */
function val(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) { const o = {}; const f = v.mapValue.fields || {}; for (const k in f) o[k] = val(f[k]); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  return null;
}
async function leggiDoc(env, percorso) {
  const r = await fetch(`${FS}/${percorso}`, { headers: { Authorization: 'Bearer ' + await token(env) } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore ${r.status} su ${percorso}` + (r.status === 403 ? ' (regole: l\'utente connettore non ha il permesso di leggere)' : ''));
  const d = await r.json(); const o = {};
  for (const k in (d.fields || {})) o[k] = val(d.fields[k]);
  return o;
}

/* ── archivio: stessa logica di lettura del gestionale (manifest + pezzi) ─ */
const SERVONO = ['clienti', 'immobili', 'visite', 'eventi', 'attivita', 'richieste'];
let _dati = null, _datiTs = 0;
async function archivio(env) {
  if (_dati && Date.now() - _datiTs < 120000) return _dati;
  const base = `users/${env.CARTELLA || 'usr_001'}`;
  const man = await leggiDoc(env, `${base}/data/lecaseAZ2_manifest`);
  if (!man || !man.keys) throw new Error('Archivio non trovato sul cloud (manca il manifest)');
  const D = {};
  await Promise.all(SERVONO.map(async k => {
    const n = man.keys[k] || 0;
    if (n === 1) { const d = await leggiDoc(env, `${base}/data/lecaseAZ2_${k}`); D[k] = (d && d.valore) || []; }
    else if (n > 1) {
      const pezzi = await Promise.all(Array.from({ length: n }, (_, i) => leggiDoc(env, `${base}/data/lecaseAZ2_${k}_${i}`).catch(() => null)));
      D[k] = [].concat(...pezzi.map(p => (p && p.valore) || []));
    } else D[k] = [];
  }));
  const rp = await leggiDoc(env, `${base}/claude/riepilogo`).catch(() => null);
  D._riepilogo = rp && rp.json ? JSON.parse(rp.json) : null;
  D._riepilogoTs = rp && rp.ts ? rp.ts : 0;
  _dati = D; _datiTs = Date.now();
  return D;
}

/* ── date (ora italiana) ─────────────────────────────────────────────── */
function oggi() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); }
function d10(x) {
  if (x === null || x === undefined || x === '') return '';
  if (typeof x === 'number') return new Date(x).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const s = String(x).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function giorniFra(da, a) { return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(da + 'T12:00:00Z')) / 86400000); }
function piuGiorni(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function it(iso) { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; }
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
function gs(iso) { return GIORNI[new Date(iso + 'T12:00:00Z').getUTCDay()] + ' ' + it(iso); }
function chiave(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim().split(/\s+/).sort().join(' '); }
function contiene(testo, cerca) { const a = chiave(testo), b = chiave(cerca).split(' '); return b.every(p => a.includes(p)); }
function euro(n) { n = parseFloat(n); return isNaN(n) || !n ? '' : '€ ' + n.toLocaleString('it-IT'); }
function vivo(x) { return x && !x.eliminata && x.archiviato !== true; }
function nomeImm(im) { if (!im) return 'immobile'; return (im.ref ? 'Ref.' + im.ref + ' ' : '') + (im.indirizzo || ((im.tipo || 'Immobile') + (im.comune ? ' — ' + im.comune : ''))); }
function immDi(D, uuid, ref) {
  if (uuid) { const x = D.immobili.find(i => i && i.uuid === uuid); if (x) return x; }
  if (ref !== '' && ref != null) return D.immobili[parseInt(ref)] || null;
  return null;
}

/* stato di un cliente oggi, dal verdetto del gestionale */
function statoCliente(c, og) {
  const rit = giorniFra(c.pr.d, og);
  let st = rit > 0 ? 'in ritardo' : (rit === 0 ? 'oggi' : (rit >= -6 ? 'questa settimana' : 'più avanti'));
  if (c.pr.f === 'agenda' && rit !== 0) st = 'già in agenda';
  return { rit, st };
}
function livelloImm(f, og, S) {
  const g = f.ul ? giorniFra(f.ul.d, og) : null;
  const liv = g === null ? 'fermo' : (g >= S.grave ? 'grave' : (g >= S.fermo ? 'fermo' : 'ok'));
  return { g, liv };
}
function avvisoRiepilogo(D) {
  if (!D._riepilogo) return '⚠ Il gestionale non ha ancora scritto il riepilogo: aprilo una volta (con la versione v.6ott o successiva) e riprova.\n';
  const g = giorniFra(D._riepilogo.calcolatoIl, oggi());
  return g > 2 ? `⚠ Riepilogo calcolato il ${it(D._riepilogo.calcolatoIl)} (${g} giorni fa): da allora il gestionale non è stato aperto, i contatti nuovi potrebbero mancare.\n` : '';
}

/* ══ GLI STRUMENTI ════════════════════════════════════════════════════ */
const STRUMENTI = {
  da_richiamare: {
    descr: 'Clienti da richiamare: quelli in ritardo e quelli di oggi (e, se richiesto, dei prossimi giorni), dal più trascurato. Usa le regole del Planning del gestionale (proposta aperta 3 gg, ha visitato 7, acquirente attivo 15, venditore 15, altri 30; una data decisa da Enzo vince sempre).',
    schema: { type: 'object', properties: { giorni_avanti: { type: 'integer', description: 'Includi anche chi va richiamato entro N giorni da oggi (0 = solo ritardi e oggi)', default: 0 } } },
    async run(env, a) {
      const D = await archivio(env), og = oggi(), R = D._riepilogo;
      if (!R) return avvisoRiepilogo(D);
      const lim = piuGiorni(og, Math.max(0, parseInt(a.giorni_avanti || 0)));
      const L = R.clienti.filter(c => c.pr.d <= lim && c.pr.f !== 'agenda')
        .map(c => ({ c, ...statoCliente(c, og) })).sort((x, y) => y.rit - x.rit);
      let out = avvisoRiepilogo(D) + `Da richiamare al ${it(og)}: ${L.length} clienti\n`;
      L.forEach(({ c, rit }) => {
        out += `\n• ${c.n}${c.t ? ' — tel ' + c.t : ''} [${c.cat}]\n  ${rit > 0 ? 'in ritardo di ' + rit + ' gg' : rit === 0 ? 'da richiamare OGGI' : 'entro il ' + it(c.pr.d)} · ${c.pr.m}\n  perché: ${c.m}\n  ultimo contatto: ${c.ul ? it(c.ul.d) + ' ' + c.ul.c + (c.ul.x ? ' (' + c.ul.x + ')' : '') : 'mai'}`;
      });
      return out;
    }
  },
  immobili_fermi: {
    descr: 'Immobili in portafoglio fermi (nessun movimento da 21 giorni) o gravi (oltre 45), con il motivo e l\'azione suggerita dal gestionale, e gli incarichi in scadenza.',
    schema: { type: 'object', properties: { tutti: { type: 'boolean', description: 'true = anche quelli che si muovono', default: false } } },
    async run(env, a) {
      const D = await archivio(env), og = oggi(), R = D._riepilogo;
      if (!R) return avvisoRiepilogo(D);
      const S = R.soglie.immobili;
      const L = R.immobili.map(f => ({ f, ...livelloImm(f, og, S) })).filter(x => a.tutti || x.liv !== 'ok')
        .sort((x, y) => (y.g ?? 9999) - (x.g ?? 9999));
      let out = avvisoRiepilogo(D) + `Immobili ${a.tutti ? 'in portafoglio' : 'fermi'} al ${it(og)}: ${L.length}\n`;
      L.forEach(({ f, g, liv }) => {
        out += `\n• ${f.n}${f.prezzo ? ' — ' + euro(f.prezzo) : ''} [${liv.toUpperCase()}${g !== null ? ', ' + g + ' gg senza movimenti' : ''}]\n  ultimo movimento: ${f.ul ? it(f.ul.d) + ' ' + f.ul.c : 'nessuno'}\n  ${f.mot.join(' · ')}\n  proprietario: ${f.prop_n || '—'}${f.prop_t ? ' tel ' + f.prop_t : ''}${f.fine ? '\n  incarico fino al ' + it(f.fine) : ''}${f.az.length ? '\n  da fare: ' + f.az.join('; ') : ''}`;
      });
      return out;
    }
  },
  agenda: {
    descr: 'Visite, appuntamenti e attività da fare in un periodo (di default da oggi per 7 giorni).',
    schema: { type: 'object', properties: { dal: { type: 'string', description: 'AAAA-MM-GG (default oggi)' }, al: { type: 'string', description: 'AAAA-MM-GG (default dal + 6 giorni)' } } },
    async run(env, a) {
      const D = await archivio(env);
      const dal = d10(a.dal) || oggi(), al = d10(a.al) || piuGiorni(dal, 6);
      const R = [];
      D.visite.filter(v => vivo(v) && d10(v.data) >= dal && d10(v.data) <= al).forEach(v =>
        R.push({ d: d10(v.data), o: v.ora || '', t: `Visita · ${v.cliente || '?'} → ${nomeImm(immDi(D, v.immUuid, v.immRef))}${v.esito && v.esito !== 'IN ATTESA' ? ' · esito ' + v.esito : ''}` }));
      const daVisita = new Set(D.visite.map(v => v && v._daEventoId).filter(Boolean));
      D.eventi.filter(e => vivo(e) && !daVisita.has(e.id) && d10(e.data) >= dal && d10(e.data) <= al && !/compleanno/i.test(e.tipo || '')).forEach(e =>
        R.push({ d: d10(e.data), o: e.ora || '', t: `${e.tipo || 'Appuntamento'} · ${e.titolo || ''}${e.cliente ? ' (' + e.cliente + ')' : ''}` }));
      D.attivita.filter(x => vivo(x) && x.stato !== 'Completata' && d10(x.scadenza) && d10(x.scadenza) <= al).forEach(x =>
        R.push({ d: d10(x.scadenza), o: '', t: `Attività${d10(x.scadenza) < dal ? ' IN RITARDO' : ''} · ${x.tipo || ''} ${x.oggetto || ''}${x.cliente ? ' (' + x.cliente + ')' : ''}` }));
      R.sort((x, y) => (x.d + x.o).localeCompare(y.d + y.o));
      let out = `Agenda dal ${it(dal)} al ${it(al)}: ${R.length} impegni\n`, g = '';
      R.forEach(r => { const dd = r.d < dal ? dal : r.d; if (dd !== g) { g = dd; out += `\n${gs(dd).toUpperCase()}\n`; } out += `  ${r.o ? r.o + ' ' : ''}${r.t}\n`; });
      return out;
    }
  },
  planning_settimana: {
    descr: 'Il planning della settimana in un colpo solo: clienti in ritardo e da richiamare nei prossimi 7 giorni, immobili fermi, incarichi in scadenza, agenda dei 7 giorni, social da pubblicare. È quello da usare per il resoconto del lunedì.',
    schema: { type: 'object', properties: {} },
    async run(env) {
      const a = await STRUMENTI.da_richiamare.run(env, { giorni_avanti: 6 });
      const b = await STRUMENTI.immobili_fermi.run(env, {});
      const c = await STRUMENTI.agenda.run(env, {});
      const D = await archivio(env), og = oggi();
      const sc = (D._riepilogo ? D._riepilogo.immobili : []).filter(f => f.fine && giorniFra(og, f.fine) <= 30)
        .map(f => `• ${f.n}: incarico ${f.fine < og ? 'SCADUTO il' : 'in scadenza il'} ${it(f.fine)}`);
      let so = '';
      try { so = await STRUMENTI.social_settimana.run(env); } catch (e) { so = 'Social non letti: ' + e.message; }
      return `=== CLIENTI ===\n${a}\n\n=== IMMOBILI ===\n${b}\n\n=== INCARICHI IN SCADENZA (30 gg) ===\n${sc.join('\n') || 'nessuno'}\n\n=== AGENDA ===\n${c}\n\n=== SOCIAL ===\n${so}`;
    }
  },
  social_settimana: {
    descr: 'I social della settimana dal Marketing Hub: post da pubblicare con giorno e ora, cosa è già programmato e dove, cosa va ancora controllato, i post nati dagli eventi degli immobili (nuovo, ribasso, venduto, proposta), quanti pubblicati.',
    schema: { type: 'object', properties: {} },
    async run(env) {
      const base = `users/${env.CARTELLA || 'usr_001'}`;
      const d = await leggiDoc(env, `${base}/data/mktAZ_settimana`);
      const S = d && d.valore;
      if (!S || !Array.isArray(S.idee)) return 'Nel Marketing Hub non ci sono ancora i social della settimana (apri l\'Hub una volta con la versione v.7ott o successiva).';
      const og = oggi(), lun = piuGiorni(og, -((new Date(og + 'T12:00:00Z').getUTCDay() + 6) % 7)), dom = piuGiorni(lun, 6);
      const PIATT = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
      const EV = { nuovo: 'nuovo in vendita', ribasso: 'prezzo ribassato', venduto: 'venduto', proposta: 'proposta in corso' };
      const lunMs = Date.parse(lun + 'T00:00:00+02:00');
      const aperte = S.idee.filter(x => x && !x.fatta && !x.archiviata)
        .sort((a, b) => String(a.quando || '9999').localeCompare(String(b.quando || '9999')));
      const riga = x => {
        const dove = Array.isArray(x.dove) && x.dove.length ? x.dove : ['ig', 'fb'];
        const prog = x.prog || {}, pub = x.pubbl || {};
        const daProg = dove.filter(p => !prog[p] && !pub[p]).map(p => PIATT[p] || p);
        const progr = dove.filter(p => prog[p] && !pub[p]).map(p => PIATT[p] || p);
        const q = x.quando ? `${gs(String(x.quando).slice(0, 10))} ${String(x.quando).slice(11, 16)}` : 'senza giorno';
        const stato = [];
        if (Array.isArray(x.verificare) && x.verificare.length && !x.verificato) stato.push('DA CONTROLLARE');
        if (progr.length) stato.push('programmato su ' + progr.join(', '));
        if (daProg.length) stato.push('da programmare su ' + daProg.join(', '));
        return `• ${q} — ${x.formato || 'Post'}${x.evento ? ' [evento: ' + (EV[x.evento.tipo] || x.evento.tipo) + ']' : ''}: ${x.titolo || '(senza titolo)'}${stato.length ? ' · ' + stato.join(' · ') : ''}`;
      };
      const questa = aperte.filter(x => !x.quando || String(x.quando).slice(0, 10) <= dom);
      const dopo = aperte.length - questa.length;
      const pubbl = (S.storico || []).filter(e => e && e.data >= lunMs).length;
      const gen = (S.ultimaGenerazione || 0) >= lunMs;
      let out = `Social dal ${it(lun)} al ${it(dom)}\nPubblicati questa settimana: ${pubbl}\n`;
      out += gen ? 'Settimana già preparata nell\'Hub.\n' : 'Settimana NON ancora preparata: si prepara da sola alla prima apertura dell\'Hub (se l\'automatico è acceso).\n';
      out += `\nDa pubblicare entro domenica (${questa.length}):\n` + (questa.map(riga).join('\n') || 'niente') + '\n';
      if (dopo) out += `\nPiù avanti: ${dopo} post già pronti.\n`;
      return out;
    }
  },
  cerca_clienti: {
    descr: 'Cerca clienti per nome (anche nome e cognome invertiti), telefono o email.',
    schema: { type: 'object', properties: { testo: { type: 'string' } }, required: ['testo'] },
    async run(env, a) {
      const D = await archivio(env), q = String(a.testo || '').trim(), num = q.replace(/\D/g, '');
      const L = D.clienti.filter(c => vivo(c) && (contiene(c.nome, q) || (num.length >= 5 && String(c.tel || '').replace(/\D/g, '').includes(num)) || (q.includes('@') && String(c.email || '').toLowerCase() === q.toLowerCase()))).slice(0, 25);
      if (!L.length) return `Nessun cliente trovato per "${q}".`;
      return `Trovati ${L.length}:\n` + L.map(c => `• ${c.nome}${c.tel ? ' — ' + c.tel : ''}${c.tipo ? ' [' + c.tipo + ']' : ''} (id ${c.uuid || '?'})`).join('\n');
    }
  },
  scheda_cliente: {
    descr: 'Scheda completa di un cliente: dati, perché seguirlo e quando richiamarlo, visite fatte con esito, appuntamenti, immobili di cui è proprietario, ultime note del Registro CRM.',
    schema: { type: 'object', properties: { cliente: { type: 'string', description: 'nome o id (uuid)' } }, required: ['cliente'] },
    async run(env, a) {
      const D = await archivio(env), q = String(a.cliente || '').trim(), og = oggi();
      let c = D.clienti.find(x => x && x.uuid === q);
      if (!c) { const L = D.clienti.filter(x => vivo(x) && contiene(x.nome, q)); if (L.length > 1) return `Più clienti corrispondono a "${q}": ${L.slice(0, 10).map(x => x.nome + ' (id ' + x.uuid + ')').join(', ')}. Ripeti con l'id.`; c = L[0]; }
      if (!c) return `Nessun cliente "${q}".`;
      const k = chiave(c.nome);
      const mio = x => (c.uuid && x.cliUuid === c.uuid) || chiave(x.cliente || x.nome) === k;
      let out = `${c.nome}${c.tipo ? ' [' + c.tipo + ']' : ''}\ntel ${c.tel || '—'} · email ${c.email || '—'}${c.archiviato ? '\nARCHIVIATO' : ''}\n`;
      const v = D._riepilogo && D._riepilogo.clienti.find(x => x.u === c.uuid);
      if (v) { const s = statoCliente(v, og); out += `\nSeguito come: ${v.cat} — ${v.m}\nUltimo contatto: ${v.ul ? it(v.ul.d) + ' ' + v.ul.c + (v.ul.x ? ' (' + v.ul.x + ')' : '') : 'mai'}\nProssimo: ${it(v.pr.d)} (${s.st}${s.rit > 0 ? ', ' + s.rit + ' gg' : ''}) — ${v.pr.m}\n`; }
      else if (c.nonSeguire) out += `\nNon lo segui più dal ${it(c.nonSeguire)}${c.nonSeguireMotivo ? ': ' + c.nonSeguireMotivo : ''}\n`;
      const vis = D.visite.filter(x => vivo(x) && mio(x)).sort((x, y) => d10(y.data).localeCompare(d10(x.data)));
      if (vis.length) out += `\nVisite (${vis.length}):\n` + vis.slice(0, 15).map(x => `  ${it(x.data)} ${nomeImm(immDi(D, x.immUuid, x.immRef))} · ${x.esito || 'IN ATTESA'}${x.feedback ? ' · "' + String(x.feedback).slice(0, 150) + '"' : ''}`).join('\n') + '\n';
      const ev = D.eventi.filter(x => vivo(x) && mio(x) && d10(x.data) >= og).sort((x, y) => d10(x.data).localeCompare(d10(y.data)));
      if (ev.length) out += `\nIn agenda:\n` + ev.slice(0, 10).map(x => `  ${it(x.data)} ${x.ora || ''} ${x.tipo || ''} ${x.titolo || ''}`).join('\n') + '\n';
      const imm = D.immobili.filter(x => vivo(x) && ((c.uuid && x.clienteUuid === c.uuid) || chiave(x.contatto) === k));
      if (imm.length) out += `\nProprietario di:\n` + imm.map(x => `  ${nomeImm(x)} ${euro(x.prezzo)}`).join('\n') + '\n';
      const note = (Array.isArray(c.crmNote) ? c.crmNote : []).slice().sort((x, y) => d10(y.ts).localeCompare(d10(x.ts))).slice(0, 10);
      if (note.length) out += `\nRegistro CRM (ultime):\n` + note.map(n => `  ${it(d10(n.ts))} ${n.tipo || ''}${n.esito ? ' [' + n.esito + ']' : ''} ${String(n.testo || '').slice(0, 200)}`).join('\n') + '\n';
      if (c.note) out += `\nNote: ${String(c.note).slice(0, 600)}\n`;
      return out;
    }
  },
  cerca_immobili: {
    descr: 'Cerca immobili per testo (ref, indirizzo, tipo, proprietario), comune e prezzo massimo. Di default solo quelli non archiviati.',
    schema: { type: 'object', properties: { testo: { type: 'string' }, comune: { type: 'string' }, prezzo_max: { type: 'number' }, anche_archiviati: { type: 'boolean', default: false } } },
    async run(env, a) {
      const D = await archivio(env);
      const L = D.immobili.filter(im => im && !im.eliminata && (a.anche_archiviati || im.archiviato !== true)
        && (!a.testo || contiene([im.ref, im.indirizzo, im.tipo, im.contatto, im.comune, im.titolo].join(' '), a.testo))
        && (!a.comune || contiene(im.comune, a.comune))
        && (!a.prezzo_max || (parseFloat(im.prezzo) || 0) <= a.prezzo_max)).slice(0, 30);
      if (!L.length) return 'Nessun immobile trovato.';
      return `Trovati ${L.length}:\n` + L.map(im => `• ${nomeImm(im)} ${euro(im.prezzo)}${im.mq ? ' · ' + im.mq + ' m²' : ''}${im.locali ? ' · ' + im.locali + ' locali' : ''}${im.stato ? ' · ' + im.stato : ''}${im.archiviato ? ' · ARCHIVIATO' : ''}`).join('\n');
    }
  },
  scheda_immobile: {
    descr: 'Scheda di un immobile: dati, proprietario, visite con esito e riscontro, stato di movimento (fermo/grave) e azioni suggerite, link dell\'annuncio.',
    schema: { type: 'object', properties: { immobile: { type: 'string', description: 'ref (es. 0001) o id (uuid)' } }, required: ['immobile'] },
    async run(env, a) {
      const D = await archivio(env), q = String(a.immobile || '').trim().replace(/^ref\.?\s*/i, ''), og = oggi();
      const im = D.immobili.find(x => x && !x.eliminata && (x.uuid === q || String(x.ref) === q || String(x.ref).replace(/^0+/, '') === q.replace(/^0+/, '')));
      if (!im) return `Nessun immobile "${a.immobile}".`;
      const idx = D.immobili.indexOf(im);
      let out = `${nomeImm(im)}\n${[im.tipo, im.comune, euro(im.prezzo), im.mq && im.mq + ' m²', im.locali && im.locali + ' locali', im.stato].filter(Boolean).join(' · ')}\nProprietario: ${im.contatto || '—'}${im.archiviato ? '\nARCHIVIATO' : ''}\n`;
      if (im.linkPortale) out += `Annuncio: ${im.linkPortale}\n`;
      const f = D._riepilogo && D._riepilogo.immobili.find(x => x.u === im.uuid);
      if (f) { const l = livelloImm(f, og, D._riepilogo.soglie.immobili); out += `\nMovimento: ${l.liv.toUpperCase()}${l.g !== null ? ' (' + l.g + ' gg dall\'ultimo: ' + it(f.ul.d) + ' ' + f.ul.c + ')' : ''}\n${f.mot.join(' · ')}\n${f.az.length ? 'Da fare: ' + f.az.join('; ') + '\n' : ''}`; }
      const vis = D.visite.filter(v => vivo(v) && ((im.uuid && v.immUuid === im.uuid) || (!v.immUuid && String(v.immRef) === String(idx)))).sort((x, y) => d10(y.data).localeCompare(d10(x.data)));
      out += `\nVisite (${vis.length}):\n` + (vis.slice(0, 20).map(v => `  ${it(v.data)} ${v.cliente || '?'} · ${v.esito || 'IN ATTESA'}${v.feedback ? ' · "' + String(v.feedback).slice(0, 200) + '"' : ''}`).join('\n') || '  nessuna') + '\n';
      return out;
    }
  },
  stato_connettore: {
    descr: 'Controllo del connettore: quanti dati legge, quando il gestionale ha scritto l\'ultimo riepilogo.',
    schema: { type: 'object', properties: {} },
    async run(env) {
      _dati = null; const D = await archivio(env);
      return `Connettore ${VERSIONE} — sola lettura\nClienti ${D.clienti.length} · immobili ${D.immobili.length} · visite ${D.visite.length} · appuntamenti ${D.eventi.length} · attività ${D.attivita.length}\nRiepilogo del gestionale: ${D._riepilogo ? 'calcolato il ' + it(D._riepilogo.calcolatoIl) + ' (' + D._riepilogo.clienti.length + ' clienti seguiti, ' + D._riepilogo.immobili.length + ' immobili)' : 'MANCANTE'}`;
    }
  }
};

/* ══ PROTOCOLLO MCP (JSON-RPC su HTTP, senza sessione) ════════════════ */
const ISTRUZIONI = 'Gestionale immobiliare di Enzo Carnicelli (Agropoli). Sola lettura: non si può modificare nulla da qui. Rispondi in italiano. Per il planning settimanale usa planning_settimana (contiene anche i social); per i soli social social_settimana; per chi richiamare da_richiamare; per un cliente o un immobile preciso le schede. I dati dei clienti sono personali: usali solo per il lavoro di Enzo.';
const VERSIONI_MCP = ['2025-06-18', '2025-03-26', '2024-11-05'];

async function rispondi(env, m) {
  const ok = result => ({ jsonrpc: '2.0', id: m.id, result });
  const ko = (code, message) => ({ jsonrpc: '2.0', id: m.id ?? null, error: { code, message } });
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return ko(-32600, 'Richiesta non valida');
  if (m.id === undefined) return null; /* notifica: nessuna risposta */
  switch (m.method) {
    case 'initialize': {
      const v = m.params && m.params.protocolVersion;
      return ok({ protocolVersion: VERSIONI_MCP.includes(v) ? v : VERSIONI_MCP[0], capabilities: { tools: {} },
        serverInfo: { name: 'gestionale-enzo', title: 'Gestionale Le case dalla A allo Z.io', version: VERSIONE }, instructions: ISTRUZIONI });
    }
    case 'ping': return ok({});
    case 'tools/list':
      return ok({ tools: Object.entries(STRUMENTI).map(([name, s]) => ({ name, description: s.descr, inputSchema: s.schema,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } })) });
    case 'tools/call': {
      const s = STRUMENTI[m.params && m.params.name];
      if (!s) return ko(-32602, 'Strumento sconosciuto: ' + (m.params && m.params.name));
      try { const t = await s.run(env, (m.params && m.params.arguments) || {}); return ok({ content: [{ type: 'text', text: t }] }); }
      catch (e) { return ok({ content: [{ type: 'text', text: 'Errore: ' + e.message }], isError: true }); }
    }
    default: return ko(-32601, 'Metodo non supportato: ' + m.method);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    /* l'indirizzo valido è solo /mcp/<SEGRETO>: tutto il resto non esiste */
    if (!env.SEGRETO || env.SEGRETO.length < 24 || url.pathname !== '/mcp/' + env.SEGRETO) return new Response('Not found', { status: 404 });
    if (req.method === 'GET' || req.method === 'DELETE') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    if (req.method !== 'POST') return new Response(null, { status: 405 });
    let corpo;
    try { corpo = await req.json(); } catch (e) { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON non valido' } }, { status: 400 }); }
    if (Array.isArray(corpo)) {
      const r = (await Promise.all(corpo.map(m => rispondi(env, m)))).filter(Boolean);
      return r.length ? Response.json(r) : new Response(null, { status: 202 });
    }
    const r = await rispondi(env, corpo);
    return r ? Response.json(r) : new Response(null, { status: 202 });
  }
};
