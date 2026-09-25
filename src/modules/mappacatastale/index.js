// modules/mappacatastale/index.js
// ----------------------------------------------------------------------------
// [17 set 2026] Questo file era VUOTO: il caricatore lo importava senza errori
// e il modulo risultava "agganciato", ma il codice della mappa non veniva mai
// eseguito. Da qui la voce Catasto del telefono che sembrava riportare alla
// home: la funzione apriMappaCatastale non esisteva.
// [25 set notte] Il .view.js si chiama con lo STESSO ?v= con cui index.html
// ha chiamato questo file (il suo _MOD_V). Prima era senza versione e il
// browser poteva tenersi la copia vecchia anche dopo aver alzato _MOD_V.
// L'"await" fa aspettare al caricatore che la mappa sia pronta, come prima.
// ----------------------------------------------------------------------------
await import('./mappacatastale.view.js' + new URL(import.meta.url).search);
