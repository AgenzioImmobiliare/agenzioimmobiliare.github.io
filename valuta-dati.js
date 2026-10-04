/* ═══════════════════════════════════════════════════════════════════════
   VALUTA CASA — dati di partenza                           [4 ott 2026]
   Un solo posto per quotazioni OMI e zone, letto da:
     · valuta-casa.html (la landing pubblica)
     · indexplus.html   (Marketing Hub → Link in Bio → Valuta casa)
   Le zone e i correttivi che Enzo cambia dall'Hub NON si scrivono qui:
   vanno nel documento pubblico/valutacasa e la landing li sovrappone a
   questi. Qui si cambia solo quando escono nuove quotazioni OMI.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
/* Quotazioni OMI (Agenzia delle Entrate, 2025/2) — €/m² min e max
   civ = abitazioni civili · eco = economiche · vil = ville e villini · box = box  */
const OMI = {"A091":{"B1":{"civ":[1500.0,1950.0],"eco":[1350.0,1850.0],"vil":[1550.0,2100.0],"box":[860.0,1100.0]},"C1":{"civ":[1550.0,2050.0],"eco":[1400.0,1850.0],"vil":[1700.0,2100.0],"box":[640.0,760.0]},"D3":{"civ":[1150.0,1700.0],"eco":[1000.0,1400.0],"vil":[1250.0,1750.0],"box":[520.0,600.0]},"R1":{"civ":[980.0,1400.0],"eco":[920.0,1200.0],"vil":[1000.0,1450.0],"box":[440.0,560.0]}},"B644":{"B1":{"civ":[840.0,1200.0],"eco":[810.0,1100.0],"box":[610.0,850.0]},"E1":{"civ":[900.0,1300.0],"eco":[850.0,1200.0],"vil":[980.0,1400.0],"box":[710.0,920.0]},"E2":{"civ":[1200.0,1700.0],"eco":[1050.0,1500.0],"vil":[1250.0,1750.0],"box":[690.0,990.0]},"E3":{"civ":[1200.0,1600.0],"eco":[960.0,1350.0],"vil":[1300.0,1700.0],"box":[530.0,740.0]},"E4":{"civ":[850.0,1200.0],"vil":[940.0,1300.0],"box":[495.0,740.0]},"R3":{"civ":[840.0,1100.0],"vil":[870.0,1200.0],"box":[445.0,650.0]}},"C125":{"B4":{"civ":[1350.0,1800.0],"eco":[1150.0,1650.0]},"E2":{"civ":[1450.0,2150.0],"eco":[1150.0,1700.0],"vil":[1500.0,2200.0]},"E3":{"civ":[1750.0,2400.0],"eco":[1450.0,2100.0],"vil":[1800.0,2500.0]},"E4":{"civ":[920.0,1250.0],"eco":[790.0,1150.0],"vil":[1000.0,1350.0],"box":[650.0,840.0]},"E5":{"civ":[1350.0,1900.0],"eco":[1150.0,1700.0],"box":[650.0,840.0]},"R1":{"civ":[810.0,1150.0],"eco":[720.0,1050.0],"vil":[940.0,1250.0]}},"G011":{"B1":{"civ":[880.0,1100.0],"eco":[770.0,1050.0],"box":[490.0,710.0]},"R1":{"civ":[730.0,1050.0],"eco":[670.0,920.0],"box":[390.0,550.0]}},"E480":{"B1":{"civ":[560.0,710.0],"vil":[710.0,910.0],"box":[425.0,490.0]},"R1":{"civ":[490.0,560.0],"vil":[560.0,710.0],"box":[365.0,425.0]}},"L212":{"B1":{"civ":[560.0,710.0],"vil":[710.0,910.0],"box":[425.0,490.0]},"R1":{"civ":[490.0,560.0],"vil":[560.0,710.0],"box":[365.0,425.0]}},"H062":{"B1":{"civ":[560.0,710.0],"vil":[710.0,910.0],"box":[425.0,490.0]},"R1":{"civ":[490.0,560.0],"box":[365.0,425.0]}},"H644":{"B1":{"civ":[620.0,910.0],"eco":[580.0,840.0],"vil":[840.0,970.0],"box":[365.0,490.0]},"R1":{"civ":[520.0,710.0],"eco":[490.0,680.0],"box":[300.0,365.0]}},"F479":{"B1":{"civ":[770.0,1100.0],"eco":[740.0,1050.0],"box":[470.0,600.0]},"E1":{"civ":[1000.0,1450.0],"eco":[880.0,1150.0],"vil":[1150.0,1700.0],"box":[470.0,600.0]},"E2":{"civ":[780.0,1050.0],"eco":[740.0,1000.0],"vil":[970.0,1250.0],"box":[470.0,600.0]},"E3":{"civ":[780.0,1050.0],"eco":[740.0,1000.0],"vil":[970.0,1250.0],"box":[470.0,600.0]},"R1":{"eco":[740.0,1000.0],"box":[740.0,1000.0]}},"I031":{"B1":{"civ":[760.0,1000.0],"box":[600.0,770.0]},"E2":{"civ":[960.0,1350.0],"vil":[1000.0,1450.0],"box":[660.0,770.0]},"R1":{"civ":[730.0,1000.0],"vil":[850.0,1050.0],"box":[550.0,730.0]}},"G796":{"B2":{"civ":[1000.0,1450.0],"eco":[790.0,1050.0],"box":[660.0,850.0]},"E1":{"civ":[1650.0,2400.0],"eco":[1400.0,2100.0],"vil":[1700.0,2500.0],"box":[660.0,850.0]},"E2":{"civ":[950.0,1250.0],"eco":[780.0,1050.0],"box":[660.0,850.0]},"E3":{"civ":[950.0,1250.0],"eco":[780.0,1050.0]},"E4":{"civ":[950.0,1250.0],"eco":[780.0,1050.0],"box":[660.0,850.0]},"E5":{"civ":[950.0,1350.0],"eco":[780.0,1050.0],"vil":[1000.0,1400.0],"box":[660.0,850.0]},"R1":{"civ":[740.0,1050.0],"eco":[730.0,1000.0],"vil":[880.0,1100.0],"box":[660.0,850.0]}}};

/* ZONE: nome che usa la gente → zona OMI + correttivo in % (da confermare) */
const COMUNI = [
  { id:'A091', nome:'Agropoli', zone:[
    { n:'Centro storico (Borgo antico)',            omi:'B1', c:5  },
    { n:'Centro / Lungomare / Corso',               omi:'B1', c:0  },
    { n:'San Marco / Selva / San Francesco',        omi:'C1', c:0  },
    { n:'Lungomare San Marco (fronte mare)',        omi:'C1', c:10 },
    { n:'Trentova',                                 omi:'R1', c:35 },
    { n:'Moio',                                     omi:'R1', c:10 },
    { n:'Mattine / Frascinelle',                    omi:'R1', c:0  },
    { n:'Fuonti / Marotta / Iscalonga / Parco Sogno', omi:'D3', c:0 },
    { n:'Campagna / resto del territorio',          omi:'R1', c:0  }
  ]},
  { id:'B644', nome:'Capaccio Paestum', zone:[
    { n:'Paestum / Laura / Licinella (costa)', omi:'E3', c:0 },
    { n:'Capaccio Scalo',                      omi:'E2', c:0 },
    { n:'Capaccio capoluogo',                  omi:'B1', c:0 },
    { n:'Borgo Nuovo / Vannulo / Capo di Fiume', omi:'E1', c:0 },
    { n:'Ponte Barizzo / Gromola',             omi:'E4', c:0 },
    { n:'Resto del territorio',                omi:'R3', c:0 }
  ]},
  { id:'C125', nome:'Castellabate', zone:[
    { n:'Santa Maria / San Marco / Lago (costa)', omi:'E3', c:0 },
    { n:'Ogliastro Marina / Arena',               omi:'E2', c:0 },
    { n:'Centro storico',                         omi:'B4', c:0 },
    { n:'Pozzillo / Torretta / Cenito',           omi:'E5', c:0 },
    { n:'Alano / San Pietro / San Gennaro',       omi:'E4', c:0 },
    { n:'Resto del territorio',                   omi:'R1', c:0 }
  ]},
  { id:'G011', nome:'Ogliastro Cilento', zone:[ { n:'Centro', omi:'B1', c:0 }, { n:'Resto del territorio', omi:'R1', c:0 } ]},
  { id:'E480', nome:'Laureana Cilento',  zone:[ { n:'Centro / San Martino', omi:'B1', c:0 }, { n:'Resto del territorio', omi:'R1', c:0 } ]},
  { id:'L212', nome:'Torchiara',         zone:[ { n:'Centro', omi:'B1', c:0 }, { n:'Resto del territorio', omi:'R1', c:0 } ]},
  { id:'H062', nome:'Prignano Cilento',  zone:[ { n:'Centro', omi:'B1', c:0 }, { n:'Resto del territorio', omi:'R1', c:0 } ]},
  { id:'H644', nome:'Rutino',            zone:[ { n:'Centro', omi:'B1', c:0 }, { n:'Resto del territorio', omi:'R1', c:0 } ]},
  { id:'F479', nome:'Montecorice', zone:[
    { n:'Agnone / Capitello / Case del Conte (costa)', omi:'E1', c:0 },
    { n:'Centro',                                      omi:'B1', c:0 },
    { n:'Zoppi / Fornelli / Ortodonico',               omi:'E2', c:0 },
    { n:'Case Mainolfo / Giungatelle',                 omi:'E3', c:0 }
  ]},
  { id:'I031', nome:'San Mauro Cilento', zone:[
    { n:'Mezzatorre (costa)',     omi:'E2', c:0 },
    { n:'Centro / Casal Sottano', omi:'B1', c:0 },
    { n:'Resto del territorio',   omi:'R1', c:0 }
  ]},
  { id:'G796', nome:'Pollica', zone:[
    { n:'Acciaroli / Pioppi (costa)',                 omi:'E1', c:0 },
    { n:'Pollica centro',                             omi:'B2', c:0 },
    { n:'Galdo',                                      omi:'E2', c:0 },
    { n:'Cannicchio',                                 omi:'E3', c:0 },
    { n:'Celso',                                      omi:'E4', c:0 },
    { n:'Santa Maria / Serravitoli / Cannetiello',    omi:'E5', c:0 },
    { n:'Resto del territorio',                       omi:'R1', c:0 }
  ]}
];

/* [4 ott 2026] INDOVINA IL PAESE: elenco da cui l'Hub pesca i 3 paesi
   sbagliati. Nomi che la gente riconosce: comuni e frazioni famose. */
var PAESI = ['Agropoli','Castellabate','Santa Maria di Castellabate','San Marco di Castellabate','Paestum','Capaccio','Ogliastro Cilento',
  'Prignano Cilento','Torchiara','Laureana Cilento','Rutino','Perdifumo','Montecorice','Agnone Cilento','San Mauro Cilento','Pollica',
  'Acciaroli','Pioppi','Casal Velino','Ascea','Velia','Pisciotta','Palinuro','Marina di Camerota','Camerota','San Giovanni a Piro',
  'Scario','Policastro Bussentino','Sapri','Vallo della Lucania','Castelnuovo Cilento','Giungano','Trentinara','Roccadaspide','Felitto',
  'Cicerale','Omignano','Sessa Cilento','Lustra','Punta Licosa','Teggiano','Padula'];

window.VC_DATI = { semestre:'2° semestre 2025', OMI:OMI, COMUNI:COMUNI, PAESI:PAESI };
})();
