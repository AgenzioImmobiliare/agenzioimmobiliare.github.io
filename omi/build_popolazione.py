# [18 nov 2026] Costruisce popolazione-salerno.json (residenti/famiglie/
# componenti medi, dati ISTAT reali) per i 158 comuni della provincia di
# Salerno, usando lo stesso codice comune di omi-salerno.json (campo "istat").
# Fonte: demo.istat.it, dataset P02 "Bilancio demografico comunale" — nessuna
# chiave richiesta, una sola richiesta per anno restituisce tutti i comuni
# della provincia. Per aggiornare con un anno più recente (quando ISTAT lo
# pubblica, di solito in autunno per l'anno precedente): aggiungere l'anno
# a ANNI e aggiornare ANNO_RIFERIMENTO, poi rilanciare:
#   python3 omi/build_popolazione.py
import json
import urllib.request
import os
import urllib.parse
import time

ANNI = [2019, 2020, 2021, 2022, 2023, 2024]
ANNO_RIFERIMENTO = 2024  # ultimo anno con dati di famiglie completi

OMI_PATH = os.path.join(os.path.dirname(__file__), 'omi-salerno.json')
OUT_PATH = os.path.join(os.path.dirname(__file__), 'popolazione-salerno.json')

HEADERS = {
    'Referer': 'https://demo.istat.it/app/?i=P02&l=it',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0',
}


def fetch_year(anno):
    data = urllib.parse.urlencode({
        'territorio': 'procom',
        'province': '065',
        'a': str(anno),
        'hid-i': 'P02',
        'hid-a': str(anno),
        'hid-l': 'it',
        'hid-cat': 'P23',
        'hid-dati': 'dati-form-1',
        'hid-tavola': 'tavola-form-1',
    }).encode()
    req = urllib.request.Request('https://demo.istat.it/app/RPCCerca.php', data=data, headers=HEADERS, method='POST')
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode('utf-8')
    d = json.loads(body)
    if not d.get('Status'):
        raise RuntimeError(f'anno {anno}: status falso, messaggio={d.get("Messaggio")}')
    return d['datatable']['data']


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip().replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def main():
    omi = json.load(open(OMI_PATH, encoding='utf-8'))
    comuni_omi = omi['comuni']

    # codice comune ISTAT (es. "065002") -> codice catastale (es. "A091"),
    # usando il campo "istat" già presente in omi-salerno.json (regione+provincia+comune)
    istat_to_catasto = {}
    for cat, c in comuni_omi.items():
        istat_full = str(c.get('istat', ''))
        if len(istat_full) >= 6:
            istat_to_catasto[istat_full[-6:]] = cat

    print(f'comuni OMI con codice ISTAT: {len(istat_to_catasto)} / {len(comuni_omi)}')

    per_anno = {}
    for anno in ANNI:
        print(f'scarico anno {anno}...')
        rows = fetch_year(anno)
        per_anno[anno] = rows
        time.sleep(0.3)

    risultato = {
        '_comment': 'Dati demografici reali ISTAT (Bilancio demografico comunale, demo.istat.it), '
                    'limitati ai comuni della provincia di Salerno. Non generato da AI: numeri scaricati '
                    'direttamente dal sito ISTAT. Aggiornare rilanciando questo script quando serve un anno più recente.',
        'fonte': 'ISTAT — Bilancio demografico comunale (demo.istat.it, dataset P02)',
        'anno_riferimento': ANNO_RIFERIMENTO,
        'anni_serie': ANNI,
        'scaricato_il': time.strftime('%Y-%m-%d'),
        'comuni': {},
    }

    mancanti = []
    for cat, c in comuni_omi.items():
        istat_full = str(c.get('istat', ''))
        codistat = istat_full[-6:] if len(istat_full) >= 6 else None
        if not codistat:
            mancanti.append(cat)
            continue

        serie = {}
        famiglie_rif = None
        componenti_rif = None
        for anno in ANNI:
            rows = per_anno[anno]
            match = [r for r in rows if r.get('codistat') == codistat and r.get('sesso') == 9]
            if not match:
                continue
            r = match[0]
            pop = r.get('pop_censita31dic') or r.get('pop_31dic')
            if pop is not None:
                serie[str(anno)] = int(pop)
            if anno == ANNO_RIFERIMENTO:
                fam = num(r.get('nr_famiglie_tot_cens'))
                med = r.get('nr_medio_fam_cens')
                if fam is not None:
                    famiglie_rif = int(round(fam))
                if med:
                    componenti_rif = str(med).strip()

        if not serie:
            mancanti.append(cat)
            continue

        risultato['comuni'][cat] = {
            'n': c.get('n'),
            'residenti': serie,
            'residenti_rif': serie.get(str(ANNO_RIFERIMENTO)),
            'famiglie_rif': famiglie_rif,
            'componenti_medi_rif': componenti_rif,
        }

    print(f'comuni scritti: {len(risultato["comuni"])}')
    print(f'comuni senza dato (mancanti): {len(mancanti)} -> {mancanti[:10]}')

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(risultato, f, ensure_ascii=False, separators=(',', ':'))

    print('scritto', OUT_PATH)


if __name__ == '__main__':
    main()
