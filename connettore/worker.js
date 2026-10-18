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
const VERSIONE = '2026-10-18-linkedin';
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
  /* [13 ott 2026] Percorsi di acquisizione (pagina Acquisizioni del
     gestionale): tappe incarico, ringraziamento, documenti dal proprietario
     e dal tecnico, foto. Il gestionale manda le tappe ancora aperte con la
     data da cui contare e la soglia di giorni scelta da Enzo; qui si conta
     sul giorno di oggi. Ferma = almeno una tappa oltre la soglia. */
  acquisizioni: {
    descr: 'Percorsi di acquisizione aperti (Nuovo incarico): a che punto sono incarico, ringraziamento, documenti dal proprietario e dal tecnico e foto, e quali sono FERMI (una tappa oltre i giorni previsti), con il motivo.',
    schema: { type: 'object', properties: { tutte: { type: 'boolean', description: 'true = anche quelle che procedono', default: false } } },
    async run(env, a) {
      const D = await archivio(env), og = oggi(), R = D._riepilogo;
      if (!R) return avvisoRiepilogo(D);
      if (!Array.isArray(R.acquisizioni)) return 'Il gestionale non ha ancora scritto le acquisizioni: aprilo una volta con la versione v.13ott-ACQ4 o successiva e riprova.';
      const ET = { incarico: 'Incarico', grazie: 'Grazie', proprietario: 'Doc. proprietario', tecnico: 'Doc. tecnico', foto: 'Foto' };
      const ST = { fare: 'da fare', corso: 'in corso', fatto: 'fatto' };
      const L = R.acquisizioni.map(x => {
        const ferme = (x.att || []).map(w => ({ ...w, oltre: giorniFra(w.d, og) - w.s })).filter(w => w.oltre > 0).sort((p, q) => q.oltre - p.oltre);
        return { x, ferme };
      }).filter(o => a.tutte || o.ferme.length).sort((p, q) => (q.ferme[0] ? q.ferme[0].oltre : -1) - (p.ferme[0] ? p.ferme[0].oltre : -1));
      const nF = R.acquisizioni.filter(x => (x.att || []).some(w => giorniFra(w.d, og) - w.s > 0)).length;
      let out = avvisoRiepilogo(D) + `Acquisizioni aperte al ${it(og)}: ${R.acquisizioni.length}, di cui ferme: ${nF}\n`;
      if (!L.length) return out + (R.acquisizioni.length ? 'Nessuna acquisizione ferma: tutte procedono nei tempi.' : 'Nessun percorso di acquisizione aperto.');
      L.forEach(({ x, ferme }) => {
        const tappe = x.st ? Object.keys(ET).map(k => `${ET[k]} ${ST[x.st[k]] || '?'}`).join(' · ') : '';
        out += `\n• ${x.n}${ferme.length ? ' [FERMA]' : ''} — avviata il ${it(x.avv)} (${giorniFra(x.avv, og)} gg)\n  proprietario: ${x.prop_n || '—'}${x.prop_t ? ' tel ' + x.prop_t : ''}\n  ${tappe}${x.foto ? '\n  foto: ' + gs(x.foto) : ''}`;
        ferme.forEach(w => { out += `\n  ferma: ${w.x} — ${w.oltre} gg oltre i ${w.s} previsti`; });
      });
      return out;
    }
  },
  planning_settimana: {
    descr: 'Il planning della settimana in un colpo solo: clienti in ritardo e da richiamare nei prossimi 7 giorni, immobili fermi, acquisizioni ferme, incarichi in scadenza, agenda dei 7 giorni, social da pubblicare. È quello da usare per il resoconto del lunedì.',
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
      let pr = '';
      try { pr = await STRUMENTI.produzione.run(env, { periodo: 'settimana_scorsa' }); } catch (e) { pr = 'Produzione non letta: ' + e.message; }
      let aq = '';
      try { aq = await STRUMENTI.acquisizioni.run(env, {}); } catch (e) { aq = 'Acquisizioni non lette: ' + e.message; }
      return `=== LA SETTIMANA SCORSA ===\n${pr}\n\n=== CLIENTI ===\n${a}\n\n=== IMMOBILI ===\n${b}\n\n=== ACQUISIZIONI FERME ===\n${aq}\n\n=== INCARICHI IN SCADENZA (30 gg) ===\n${sc.join('\n') || 'nessuno'}\n\n=== AGENDA ===\n${c}\n\n=== SOCIAL ===\n${so}`;
    }
  },
  social_settimana: {
    descr: 'I social della settimana dal Marketing Hub: post da pubblicare con giorno e ora SOCIAL PER SOCIAL (ognuno ha la sua ora fissa), cosa è già programmato e dove, cosa è in ritardo, cosa va ancora controllato, i post nati dagli eventi degli immobili e i lavori pronti da Google Drive, il PROMEMORIA TIKTOK (TikTok si pubblica sempre a mano) e le storie di Instagram, quanti pubblicati.',
    schema: { type: 'object', properties: {} },
    async run(env) {
      const base = `users/${env.CARTELLA || 'usr_001'}`;
      const d = await leggiDoc(env, `${base}/data/mktAZ_settimana`);
      const S = d && d.valore;
      if (!S || !Array.isArray(S.idee)) return 'Nel Marketing Hub non ci sono ancora i social della settimana (apri l\'Hub una volta con la versione v.7ott o successiva).';
      const og = oggi(), lun = piuGiorni(og, -((new Date(og + 'T12:00:00Z').getUTCDay() + 6) % 7)), dom = piuGiorni(lun, 6);
      const PIATT = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube', li: 'LinkedIn' };   /* [18 ott 2026] LinkedIn, a mano */
      const EV = { nuovo: 'nuovo in vendita', ribasso: 'prezzo ribassato', venduto: 'venduto', proposta: 'proposta in corso' };
      const lunMs = Date.parse(lun + 'T00:00:00+02:00');
      const aperte = S.idee.filter(x => x && !x.fatta && !x.archiviata)
        .sort((a, b) => String(a.quando || '9999').localeCompare(String(b.quando || '9999')));
      /* [14 ott 2026] ogni social ha il suo giorno e la sua ora (x.quandoP);
         TikTok si pubblica sempre a mano: promemoria a parte */
      const ORE_BASE = { fb: '09:00', yt: '17:00', ig: '18:30', tt: '21:00', st: '12:30', li: '08:30' };
      const oreS = (S.orari && S.orari.ore) || {};
      const ore = {}; Object.keys(ORE_BASE).forEach(k => { ore[k] = /^\d{1,2}:\d{2}$/.test(oreS[k] || '') ? String(oreS[k]).padStart(5, '0') : ORE_BASE[k]; });
      const PROV = { mio: 'mio', frimm: 'agenzia FRIMM', altro: 'altro' };
      const adesso = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).replace(' ', 'T').slice(0, 16);
      const quandoP = (x, p) => (x.quandoP && x.quandoP[p]) ? String(x.quandoP[p]).slice(0, 16) : (x.quando ? String(x.quando).slice(0, 16) : '');
      const qIt = q => q ? `${gs(q.slice(0, 10))} ${q.slice(11, 16)}` : 'senza giorno';
      const prima = x => { const dove = Array.isArray(x.dove) && x.dove.length ? x.dove : ['ig', 'fb']; return dove.filter(p => !(x.pubbl || {})[p]).map(p => quandoP(x, p)).filter(Boolean).sort()[0] || ''; };
      const riga = x => {
        const dove = Array.isArray(x.dove) && x.dove.length ? x.dove : ['ig', 'fb'];
        const prog = x.prog || {}, pub = x.pubbl || {};
        const usc = dove.filter(p => !pub[p]).map(p => {
          const q = quandoP(x, p), st = prog[p] ? 'programmato' : (q && q < adesso ? 'IN RITARDO' : 'da programmare');
          return `${PIATT[p] || p} ${qIt(q)} (${st})`;
        });
        const fatti = dove.filter(p => pub[p]).map(p => PIATT[p] || p);
        const extra = [];
        if (Array.isArray(x.verificare) && x.verificare.length && !x.verificato) extra.push('DA CONTROLLARE');
        if (fatti.length) extra.push('già uscito su ' + fatti.join(', '));
        const tipo = (x.formato || 'Post') + (x.evento ? ' [evento: ' + (EV[x.evento.tipo] || x.evento.tipo) + ']' : '') + (x.esterno ? ' [lavoro pronto · ' + (PROV[x.esterno.prov] || 'altro') + ']' : '');
        return `• ${tipo}: ${x.titolo || '(senza titolo)'}${extra.length ? ' · ' + extra.join(' · ') : ''}\n    ${usc.join(' · ') || 'uscito dappertutto'}`;
      };
      const ordinate = aperte.slice().sort((a, b) => String(prima(a) || '9999').localeCompare(String(prima(b) || '9999')));
      const questa = ordinate.filter(x => !prima(x) || prima(x).slice(0, 10) <= dom);
      const dopo = ordinate.length - questa.length;
      const pubbl = (S.storico || []).filter(e => e && e.data >= lunMs).length;
      const gen = (S.ultimaGenerazione || 0) >= lunMs;
      /* TikTok: i post della settimana non ancora programmati né pubblicati */
      const tt = aperte.filter(x => (x.dove || []).indexOf('tt') >= 0 && !(x.pubbl || {}).tt && !(x.prog || {}).tt)
        .map(x => ({ x, q: quandoP(x, 'tt') })).filter(v => !v.q || v.q.slice(0, 10) <= dom)
        .sort((a, b) => String(a.q || '9999').localeCompare(String(b.q || '9999')));
      /* storie di Instagram della settimana */
      const storie = (Array.isArray(S.storie) ? S.storie : []).filter(v => v && !v.fatta && v.quando && String(v.quando).slice(0, 10) <= dom)
        .sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
      let out = `Social dal ${it(lun)} al ${it(dom)}\nPubblicati questa settimana: ${pubbl}\n`;
      out += `Ore fisse: Facebook ${ore.fb} · YouTube ${ore.yt} · Instagram ${ore.ig} · TikTok ${ore.tt} · LinkedIn ${ore.li} (a mano) · storie Instagram ${ore.st}\n`;
      out += gen ? 'Settimana già preparata nell\'Hub.\n' : 'Settimana NON ancora preparata: si prepara da sola alla prima apertura dell\'Hub (se l\'automatico è acceso).\n';
      out += `\nDa pubblicare entro domenica (${questa.length}):\n` + (questa.map(riga).join('\n') || 'niente') + '\n';
      if (dopo) out += `\nPiù avanti: ${dopo} post già pronti.\n`;
      out += `\nPROMEMORIA TIKTOK (si pubblica a mano, da TikTok Studio o dal telefono): ` + (tt.length
        ? `${tt.length}\n` + tt.map(v => `• ${qIt(v.q)}${v.q && v.q < adesso ? ' IN RITARDO' : ''} — ${v.x.titolo || '(senza titolo)'}${v.x.esterno ? ' (file su Google Drive: "Scarica i file" nell\'Hub)' : ''}`).join('\n') + '\n'
        : 'niente da fare questa settimana.\n');
      out += `\nStorie di Instagram ancora da fare entro domenica: ${storie.length}` + (storie.length ? '\n' + storie.map(v => `• ${qIt(String(v.quando).slice(0, 16))}${String(v.quando).slice(0, 16) < adesso ? ' IN RITARDO' : ''} — ${String(v.frase || '').replace(/\*/g, '')}`).join('\n') : '') + '\n';
      return out;
    }
  },
  /* [13 ott 2026] Cosa è stato prodotto in un periodo. Lo calcola il
     gestionale (pagina Produzione, stesse regole degli Obiettivi) e lo scrive
     nel riepilogo: qui si sceglie solo il periodo. Niente provvigioni. */
  produzione: {
    descr: 'Cosa è stato prodotto in una settimana o in un mese: incarichi presi, valutazioni, visite, contatti (telefonate, WhatsApp, email, chiamate Pipeline), nuovi clienti, notizie, proposte, rogiti, con il confronto col periodo prima e l\'elenco di cosa c\'è dentro. Calcolato dal gestionale (pagina Produzione). Senza provvigioni.',
    schema: { type: 'object', properties: {
      periodo: { type: 'string', enum: ['settimana_scorsa', 'questa_settimana', 'questo_mese', 'mese_scorso'], default: 'settimana_scorsa' },
      elenco: { type: 'boolean', description: 'true = anche l\'elenco delle voci (chi, quale immobile, giorno)', default: true } } },
    async run(env, a) {
      const D = await archivio(env), og = oggi(), R = D._riepilogo;
      if (!R) return avvisoRiepilogo(D);
      const P = R.produzione;
      if (!Array.isArray(P) || !P.length) return 'Il gestionale non ha ancora scritto la produzione: aprilo una volta con la versione v.13ott o successiva e riprova.';
      const lun = piuGiorni(og, -((new Date(og + 'T12:00:00Z').getUTCDay() + 6) % 7));
      const per = a.periodo || 'settimana_scorsa';
      let cerca;
      if (per === 'questa_settimana') cerca = { tipo: 'settimana', a: lun };
      else if (per === 'settimana_scorsa') cerca = { tipo: 'settimana', a: piuGiorni(lun, -7) };
      else if (per === 'questo_mese') cerca = { tipo: 'mese', a: og.slice(0, 8) + '01' };
      else { const d = new Date(og.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); cerca = { tipo: 'mese', a: d.toISOString().slice(0, 8) + '01' }; }
      const i = P.findIndex(p => p.tipo === cerca.tipo && p.a === cerca.a);
      if (i < 0) return `Il riepilogo è del ${it(R.calcolatoIl)} e non contiene ancora questo periodo (dal ${it(cerca.a)}): apri il gestionale e riprova.`;
      const p = P[i], prima = P.find(q => q.tipo === p.tipo && q.b < p.a && (p.tipo === 'mese' || q.a === piuGiorni(p.a, -7)));
      const parziale = p.fino < p.b && p.b < og;
      let out = avvisoRiepilogo(D) + `Produzione dal ${it(p.a)} al ${it(p.b)}${p.fino < p.b ? ' (contata fino al ' + it(p.fino) + ')' : ''}\n`;
      if (parziale) out += `⚠ Il gestionale non è stato aperto dopo il ${it(p.fino)}: gli ultimi giorni del periodo mancano.\n`;
      out += '\n' + Object.keys(p.voci).map(k => { const v = p.voci[k], q = prima && prima.voci[k]; return `• ${v.nome}: ${v.n}${q ? ' (periodo prima: ' + q.n + ')' : ''}`; }).join('\n') + '\n';
      if (a.elenco !== false) Object.keys(p.voci).forEach(k => {
        const v = p.voci[k]; if (!v.el.length) return;
        out += `\n${v.nome.toUpperCase()}\n` + v.el.map(e => `  ${it(e.d)} ${e.t}${e.x ? ' — ' + e.x : ''}`).join('\n') + (v.n > v.el.length ? `\n  … e altri ${v.n - v.el.length}` : '') + '\n';
      });
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
      /* [13 ott 2026] anagrafica completa */
      const res = [[c.indirizzo, c.civico].filter(Boolean).join(' '), [c.cap, c.citta].filter(Boolean).join(' ') + (c.prov ? ' (' + c.prov + ')' : '')].filter(x => x && x.trim()).join(', ');
      if (res || c.nazionalita) out += `${res ? 'residenza ' + res : ''}${res && c.nazionalita ? ' · ' : ''}${c.nazionalita ? 'nazionalità ' + c.nazionalita : ''}\n`;
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
const ISTRUZIONI = 'Gestionale immobiliare di Enzo Carnicelli (Agropoli). Sola lettura: non si può modificare nulla da qui. Rispondi in italiano. Per il planning settimanale usa planning_settimana (contiene anche i social e la produzione della settimana scorsa); per cosa è stato fatto in una settimana o in un mese produzione; per i soli social social_settimana; per i percorsi di acquisizione (nuovi incarichi, documenti, foto) acquisizioni; per chi richiamare da_richiamare; per un cliente o un immobile preciso le schede. I dati dei clienti sono personali: usali solo per il lavoro di Enzo.';
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
