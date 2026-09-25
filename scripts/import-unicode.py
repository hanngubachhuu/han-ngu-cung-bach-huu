"""Reproducible Unicode 17 import. Never infer Han-Viet from kVietnamese."""
import io, json, pathlib, urllib.request, zipfile, hashlib
root = pathlib.Path(__file__).resolve().parent.parent
target = root / 'data' / 'study'
target.mkdir(parents=True, exist_ok=True)
base = 'https://www.unicode.org/Public/17.0.0/ucd/'
def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response: return response.read()
radical_raw = fetch(base + 'CJKRadicals.txt')
radicals, radical_map = [], {}
for line in radical_raw.decode().splitlines():
    if not line or line.startswith('#'): continue
    n, symbol, char = [s.strip() for s in line.split(';')]
    radical_map[n] = chr(int(char, 16))
    if "'" not in n: radicals.append({'number': int(n), 'character': chr(int(char, 16)), 'symbol': chr(int(symbol,16))})
archive = fetch(base + 'Unihan.zip')
fields = {'kMandarin', 'kTotalStrokes', 'kRSUnicode', 'kTraditionalVariant', 'kSimplifiedVariant'}
seed = json.loads((root/'.cache/study-seed.json').read_text(encoding='utf-8'))
wanted = set(c['character'] for c in seed['characters']) | set(r['character'] for r in radicals)
data = {c:{} for c in wanted}
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    for name in z.namelist():
        for line in z.read(name).decode('utf-8').splitlines():
            if not line or line.startswith('#'): continue
            cp, key, value = line.split('\t',2)
            char = chr(int(cp[2:],16))
            if char not in wanted or key not in fields: continue
            item = data[char]
            if key=='kMandarin': item['pinyin']=value.split()[0]
            elif key=='kTotalStrokes': item['strokeCount']=int(value.split()[0])
            elif key=='kRSUnicode':
                number=value.split()[0].split('.')[0]
                item['radicalNumber']=int(number.replace("'",'')); item['radical']=radical_map.get(number)
            else:
                item['traditional' if key=='kTraditionalVariant' else 'simplified']=[chr(int(v.split('<')[0][2:],16)) for v in value.split()]
provenance={'source':base+'Unihan.zip','sourceVersion':'17.0.0','license':'Unicode-3.0','sha256':hashlib.sha256(archive).hexdigest()}
(target/'unicode.json').write_text(json.dumps({'characters':data,'radicals':radicals,'provenance':provenance},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(target/'UNICODE-LICENSE.txt').write_bytes(fetch('https://www.unicode.org/license.txt'))
print(json.dumps({'characters':len(data),'radicals':len(radicals),'version':'17.0.0'}))
