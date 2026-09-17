// modules/osservatorio/index.js
// ----------------------------------------------------------------------------
// [17 set 2026] Anche questo file era VUOTO, come quello della mappa
// catastale: il caricatore lo importava senza errori, il modulo risultava
// "agganciato" e nessuna delle sue funzioni (imioBoot, imioRender,
// imioHandleFile…) arrivava su window. La sezione Osservatorio restava quindi
// muta: nessun grafico, nessuna tabella, il pulsante di import senza effetto.
// La riga qui sotto esegue osservatorio.view.js, che mette le sue funzioni su
// window.
// ----------------------------------------------------------------------------
export * from './osservatorio.view.js';
