// modules/mappacatastale/index.js
// ----------------------------------------------------------------------------
// [17 set 2026] Questo file era VUOTO: il caricatore lo importava senza errori
// e il modulo risultava "agganciato", ma il codice della mappa non veniva mai
// eseguito. Da qui la voce Catasto del telefono che sembrava riportare alla
// home: la funzione apriMappaCatastale non esisteva.
// La riga qui sotto è tutto quello che serve: esegue mappacatastale.view.js,
// che mette le sue funzioni su window.
// ----------------------------------------------------------------------------
export * from './mappacatastale.view.js';
