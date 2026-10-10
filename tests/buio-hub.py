"""Rigenera la MODALITÀ SCURA dell'Hub (indexplus.html) — [10 ott 2026]

Uso, dalla cartella del sito:   python3 tests/buio-hub.py
Rilancialo quando nell'Hub si aggiungono stili o colori scritti a mano: legge lo
stile principale, gli stili dell'Open House e i colori scritti nel codice, e
riscrive SOLO la parte generata di <style id="hub-buio-css">. La parte fissa
(tema, cornice, anteprime) e lo script hubTema() non li tocca.
Regole: bianchi → var(--hb-card), grigi chiari → var(--hb-sub), tinte chiare →
stessa tinta trasparente, testi scuri → --text/--text2/--text3 o tinta schiarita,
bordi chiari → var(--hb-bordo), fondi var(--navy) → var(--hb-pieno). Le regole di
colore della stessa famiglia di classi si riscrivono tutte, nell'ordine
originale, così gli stati (.attivo, :hover) continuano a vincere.
Non toccati: Piano Social (ha il suo buio), editor video, anteprime di stampa,
video e Link in Bio (SALTA ed EXCL qui sotto).
"""
import re, sys, colorsys
SRC=sys.argv[1] if len(sys.argv)>1 else 'indexplus.html'
s=open(SRC,encoding='utf-8').read()
s=re.sub(r'<style id="hub-buio-css">.*?</style>','',s,flags=re.S)
i0=s.index('<style>'); i1=s.index('</style>', i0)
css=s[i0+7:i1]
# togli il blocco fisso del tema, se già c'è
css=re.sub(r'/\* ═+ TEMA E BUIO DELL\'HUB.*', '', css, flags=re.S)
css=re.sub(r'/\*.*?\*/','',css,flags=re.S)

def hex2rgb(h):
    h=h.lstrip('#')
    if len(h) in (3,4): h=''.join(c*2 for c in h[:3])
    h=h[:6]
    return tuple(int(h[i:i+2],16)/255 for i in (0,2,4))
NAMED={'white':'#ffffff','black':'#000000'}
def parse(v):
    v=v.strip().lower()
    if v in NAMED: return hex2rgb(NAMED[v]),1
    m=re.fullmatch(r'#([0-9a-f]{3,8})',v)
    if m and len(m.group(1)) in (3,4,6,8):
        a=1
        if len(m.group(1))==8: a=int(m.group(1)[6:],16)/255
        return hex2rgb(v),a
    m=re.fullmatch(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)',v)
    if m: return tuple(int(m.group(i))/255 for i in (1,2,3)), float(m.group(4) or 1)
    return None,None
def lum(c):
    f=lambda x: x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4
    r,g,b=map(f,c); return 0.2126*r+0.7152*g+0.0722*b
def hls(c): return colorsys.rgb_to_hls(*c)
def tohex(c): return '#%02X%02X%02X'%tuple(round(max(0,min(1,x))*255) for x in c)

def bg_map(c,a):
    """sfondo -> sfondo scuro, oppure None se va bene così"""
    if a<0.5: return None
    L=lum(c); h,l,sat=hls(c)
    if L<0.55: return None          # sfondi già scuri o colori pieni: restano
    if sat<0.25 or l>0.985:          # bianchi e grigi chiarissimi
        return 'var(--hb-card)' if l>0.985 else 'var(--hb-sub)'
    # tinta chiara: stesso colore, trasparente sul fondo scuro
    r,g,b=colorsys.hls_to_rgb(h,0.55,min(1,max(0.55,sat)))
    return 'rgba(%d,%d,%d,.16)'%(r*255,g*255,b*255)
def fg_map(c,a):
    """testo -> testo leggibile al buio, oppure None"""
    L=lum(c); h,l,sat=hls(c)
    if L>0.30: return None
    if sat<0.18:
        if L<0.06: return 'var(--text)'
        if L<0.16: return 'var(--text2)'
        return 'var(--text3)'
    r,g,b=colorsys.hls_to_rgb(h,0.74,min(0.85,max(0.5,sat)))
    return tohex((r,g,b))
def bd_map(c,a):
    L=lum(c)
    if L>0.6: return 'var(--hb-bordo)'
    return None

COL=r'(#[0-9a-fA-F]{3,8}\b|white\b|rgba?\([^)]*\))'
# ── 1) regole CSS con colori scritti a mano ──
SALTA=re.compile(r'#sec-settimana|\.vai-(?!start|drop|imm-|recap|manual|lt-btn)|\.vdi-|#vai-|vai-stage|vai-overlay|vai-player|vai-ovl|vx-stage|vx-pag|vx-el|\.lp-|lib-tel|vc-pv|soc-preview|big-preview|\.ps-|hub-|@|print|::-webkit-scrollbar|\.toast|#toast|:root|\.app-header|\.sidebar|\.nav-|\.kpi-mini|\.logo|\.header-badge')
out=[]
def walk(text):
    pos=0; n=len(text)
    while pos<n:
        j=text.find('{',pos)
        if j<0: break
        sel=text[pos:j].strip()
        # trova la graffa che chiude
        d=1;k=j+1
        while k<n and d:
            if text[k]=='{': d+=1
            elif text[k]=='}': d-=1
            k+=1
        body=text[j+1:k-1]
        if sel.startswith('@media') and 'print' not in sel:
            inner=[]
            walk_rules=walk_collect(body)
            if walk_rules: out.append((sel, walk_rules))
        elif not sel.startswith('@'):
            r=rule(sel,body)
            if r: out.append(r)
        pos=k
def walk_collect(text):
    res=[]; pos=0; n=len(text)
    while pos<n:
        j=text.find('{',pos)
        if j<0: break
        sel=text[pos:j].strip(); k=text.find('}',j)
        if k<0: break
        if not sel.startswith('@'):
            r=rule(sel,text[j+1:k])
            if r: res.append(r)
        pos=k+1
    return res
def rule(sel,body):
    """Riscrive TUTTE le dichiarazioni di colore della regola (quelle che al buio
    cambiano e quelle che restano uguali), così fra le regole generate vale lo
    stesso ordine dell'originale: una regola di stato (.btn.active) continua a
    battere la regola di base (.btn) anche al buio."""
    if not sel or SALTA.search(sel): return None
    decl=[]; cambiate=0
    # se la regola ha un fondo che al buio resta colorato (oro, verde pieno…), il suo testo resta com'è
    fondo_fisso=False
    for m in re.finditer(r'(?:^|;)\s*(background(?:-color)?)\s*:\s*([^;]+)',body):
        v=m.group(2).replace('!important','').strip()
        if re.search(r'transparent|none|inherit|initial|unset',v): continue
        if re.fullmatch(r'var\(--navy[23]?\)',v): fondo_fisso=True; continue
        if 'var(' in v: fondo_fisso=True; continue
        cm=re.search(COL,v)
        if cm:
            c,a2=parse(cm.group(1))
            if c is not None and a2>0.5 and not bg_map(c,a2): fondo_fisso=True
    for m in re.finditer(r'(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)',body):
        p,v=m.group(1),m.group(2).strip()
        if p not in ('background','background-color','color','border','border-top','border-bottom','border-left','border-right','border-color','border-bottom-color','border-top-color','border-left-color','border-right-color'): continue
        imp='!important' if '!important' in v else ''
        v=v.replace('!important','').strip()
        nv=None; np=p
        if p in ('background','background-color') and re.fullmatch(r'var\(--navy[23]?\)',v):
            nv='var(--hb-pieno)'; np='background'
        elif p in ('background','background-color') and 'gradient' in v and 'var(' not in v:
            cs=[parse(x) for x in re.findall(COL,v)]
            mp=[bg_map(c,a) for c,a in cs if c is not None]
            if cs and len(mp)==len(cs) and all(mp): nv=mp[0]; np='background'
        elif 'var(' in v or 'gradient' in v or 'url(' in v: pass
        elif p in ('background','background-color'):
            cm=re.fullmatch(COL,v)
            if cm:
                c,a=parse(cm.group(1))
                if c is not None:
                    nv=bg_map(c,a); np='background'
        elif p=='color':
            c,a=parse(v)
            if c is not None and not fondo_fisso: nv=fg_map(c,a)
        else:
            cm=re.search(COL,v)
            if cm:
                c,a=parse(cm.group(1))
                if c is not None:
                    nv=bd_map(c,a); np=p if p.endswith('color') else p+'-color'
        if nv: decl.append(np+':'+nv+imp); cambiate+=1
        else:
            if p in ('background','background-color') and np=='background' and not re.search(r'url\(|gradient',v): decl.append('background-color:'+v+imp)
            elif p in ('background','background-color'): decl.append(p+':'+v+imp)
            elif p=='color': decl.append('color:'+v+imp)
            elif p.endswith('color'): decl.append(p+':'+v+imp)
            else:
                cm=re.search(COL+r'|var\([^)]*\)\)?',v)
                if cm: decl.append((p+'-color')+':'+cm.group(0)+imp)
    if not decl: return None
    if not cambiate: decl=['__resta__']+decl
    parts=[x.strip() for x in sel.split(',') if x.strip()]
    def pre(x):
        if x.startswith('body'): return 'body.hub-buio'+x[4:]
        if x.startswith('html'): return 'html body.hub-buio '+x[4:].strip()
        return 'body.hub-buio '+x
    sels=','.join(pre(x) for x in parts)
    return sels+'{'+';'.join(d for d in decl if d!='__resta__')+'}', bool(cambiate)
walk(css)
for m in re.finditer(r"st\.id\s*=\s*'ohx-css'(.*?)appendChild\(st\)", s, flags=re.S):
    walk(''.join(re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(1))))

# ── 2) stili scritti nel codice (style="…" e stringhe JS) ──
EXCL='.vai-stage,#vai-overlay,#vai-player-wrap,.vx-stage,#vx-stage,.vc-pv,#big-preview,.lib-tel-in,#sec-settimana'
nott=(':not(:is(%s) *):not(:is(%s))'%(EXCL,EXCL)) if EXCL else ''
inl={}
for m in re.finditer(r'(?<![a-zA-Z-])(background-color|background|color|border-color|border(?:-top|-bottom|-left|-right)?)\s*:\s*(#[0-9a-fA-F]{3,8}|white)(?![0-9a-fA-F])',s):
    p,v=m.group(1),m.group(2)
    lit=m.group(0)
    c,a=parse(v)
    if c is None: continue
    if p.startswith('background'): nv=bg_map(c,a); prop='background'
    elif p=='color': nv=fg_map(c,a); prop='color'
    else: nv=bd_map(c,a); prop='border-color'
    if not nv: continue
    inl.setdefault((prop,nv),set()).add(lit)
for m in re.finditer(r'(?<![a-zA-Z-])(border(?:-top|-bottom|-left|-right)?)\s*:\s*(\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted)\s+)(#[0-9a-fA-F]{3,8})(?![0-9a-fA-F])',s):
    c,a=parse(m.group(3))
    if c is None: continue
    nv=bd_map(c,a)
    if nv: inl.setdefault(('border-color',nv),set()).add(m.group(0))
for m in re.finditer(r'(?<![a-zA-Z-])background(?:-color)?\s*:\s*var\(--navy[23]?\)',s):
    inl.setdefault(('background','var(--hb-pieno)'),set()).add(m.group(0))
for v in set(x.upper() for x in re.findall(r"['\"](#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})['\"]",s)):
    c,a=parse(v)
    nv=fg_map(c,a)
    if nv:
        for pre_ in ('color:','color: '): inl.setdefault(('color',nv),set()).add(pre_+v)
        inl.setdefault(('--c',nv),set()).add('--c:'+v)
    nv=bg_map(c,a)
    if nv:
        for pre_ in ('background:','background-color:','background: '): inl.setdefault(('background',nv),set()).add(pre_+v)
regole=[]
for (prop,nv),lits in sorted(inl.items()):
    sel=[]
    for lit in sorted(lits):
        for coda in (';',' ','!'):
            sel.append('[style*="%s%s" i]'%(lit,coda))
        sel.append('[style$="%s" i]'%lit)
    regole.append('body.hub-buio :is(%s)%s{%s:%s!important}'%(','.join(sel),nott,prop,nv))
cls_cambiate=set()
def _cls(t): return set(re.findall(r'\.([A-Za-z0-9_-]+)', t.split('{')[0]))
def _tutte(o):
    for x in o:
        if isinstance(x[1], list): yield from x[1]
        else: yield x
for t,c in _tutte(out):
    if c: cls_cambiate |= _cls(t)
def _tieni(t,c): return c or bool(_cls(t) & cls_cambiate)
righe=[]
for x in out:
    if isinstance(x[1], list):
        dentro=[t for t,c in x[1] if _tieni(t,c)]
        if dentro: righe.append(x[0]+'{'+''.join(dentro)+'}')
    elif _tieni(*x): righe.append(x[0])
out=righe
gen='\n'.join(out)+'\n/* stili scritti nel codice */\n'+'\n'.join(regole)

# ── 3) rimette il blocco generato nell'Hub, lasciando com'è la parte fissa ──
h=open(SRC,encoding='utf-8').read()
i=h.index('<style id="hub-buio-css">')
a=h.index('*/\n',i)+3
b=h.index("/* ═══════════════ TEMA E BUIO DELL'HUB",a)
h=h[:a]+gen+'\n\n'+h[b:]
open(SRC,'w',encoding='utf-8').write(h)
print(len(out),'regole CSS ·',len(regole),'regole inline ·',sum(len(v) for v in inl.values()),'valori ·',len(gen)//1024,'KB')
