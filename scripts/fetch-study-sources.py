"""Download pinned, openly licensed data; never execute downloaded code.

Run manually when reviewing source updates. Normal builds run offline from
the compressed snapshots committed in sources/dictionaries/.
"""
import gzip
import hashlib
import io
import json
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'sources' / 'dictionaries'
OUT.mkdir(parents=True, exist_ok=True)
CV_REV = 'c379d909e308343a247e51619f7839a2060a271c'
HV_REV = 'a1292b0fdfbfeed41e08ae53e8bc4e01167bed28'
JIEBA_REV = '67fa2e36e72f69d9134b8a1037b83fbb070b9775'
SOURCES = []

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'HanNguBachHuu-OpenDictionary/1.0'})
    with urllib.request.urlopen(request, timeout=90) as response:
        value = response.read(100_000_001)
    if len(value) > 100_000_000:
        raise ValueError('Source unexpectedly large')
    return value

def digest(value):
    return hashlib.sha256(value).hexdigest()

def snapshot(name, value):
    (OUT / name).write_bytes(gzip.compress(value, mtime=0))
    return {'file': name, 'sha256': digest(value), 'bytes': len(value)}

cv_url = f'https://raw.githubusercontent.com/ph0ngp/CVDICT/{CV_REV}/CVDICT.u8'
cv = fetch(cv_url)
SOURCES.append({'id': 'cvdict', 'name': 'CVDICT', 'author': 'Phong Phan; CC-CEDICT contributors',
                'url': 'https://github.com/ph0ngp/CVDICT', 'downloadUrl': cv_url,
                'version': CV_REV, 'license': 'CC-BY-SA-4.0',
                'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
                'quality': 'ai-assisted-translation', **snapshot('cvdict.u8.gz', cv)})
(OUT / 'CVDICT-README.md').write_bytes(fetch(f'https://raw.githubusercontent.com/ph0ngp/CVDICT/{CV_REV}/README.md'))

hv_url = f'https://raw.githubusercontent.com/ph0ngp/hanviet-pinyin-words/{HV_REV}/src/hanvietData.js'
hv_raw = fetch(hv_url)
hv_text = hv_raw.decode('utf-8').strip()
prefix = 'export const hanvietData = '
if not hv_text.startswith(prefix):
    raise ValueError('Unexpected Han-Viet data format')
hv = json.loads(hv_text[len(prefix):].rstrip(';'))
hv_json = json.dumps(hv, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
SOURCES.append({'id': 'hanviet', 'name': 'Hán Việt Pinyin', 'author': 'Phong Phan',
                'url': 'https://github.com/ph0ngp/hanviet-pinyin-wordlist', 'downloadUrl': hv_url,
                'version': HV_REV, 'license': 'MIT', 'upstreamSha256': digest(hv_raw),
                'licenseUrl': f'https://github.com/ph0ngp/hanviet-pinyin-words/blob/{HV_REV}/LICENSE',
                'quality': 'community-reference', **snapshot('hanviet.json.gz', hv_json)})
for filename in ('LICENSE', 'README.md'):
    (OUT / ('HANVIET-' + filename)).write_bytes(fetch(f'https://raw.githubusercontent.com/ph0ngp/hanviet-pinyin-words/{HV_REV}/{filename}'))

unicode_url = 'https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip'
archive = fetch(unicode_url)
radicals_raw = fetch('https://www.unicode.org/Public/17.0.0/ucd/CJKRadicals.txt')
radicals = {}
for line in radicals_raw.decode('utf-8').splitlines():
    if not line or line.startswith('#'):
        continue
    number, symbol, char = [x.strip() for x in line.split(';')]
    radicals[number] = chr(int(char, 16))
fields = {'kMandarin', 'kTotalStrokes', 'kRSUnicode', 'kTraditionalVariant', 'kSimplifiedVariant',
          'kVietnamese', 'kDefinition', 'kTGH', 'kHanyuPinyin'}
characters = {}
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    for name in z.namelist():
        for line in z.read(name).decode('utf-8').splitlines():
            if not line or line.startswith('#'):
                continue
            cp, field, value = line.split('\t', 2)
            if field not in fields:
                continue
            char = chr(int(cp[2:], 16))
            characters.setdefault(char, {})[field] = value
payload = json.dumps({'characters': characters, 'radicals': radicals}, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
SOURCES.append({'id': 'unihan', 'name': 'Unicode Unihan 17.0', 'author': 'Unicode, Inc.',
                'url': 'https://www.unicode.org/reports/tr38/', 'downloadUrl': unicode_url,
                'version': '17.0.0', 'license': 'Unicode-3.0', 'upstreamSha256': digest(archive),
                'radicalsSha256': digest(radicals_raw), 'licenseUrl': 'https://www.unicode.org/license.txt',
                'quality': 'reference', **snapshot('unihan.json.gz', payload)})
(OUT / 'UNICODE-LICENSE.txt').write_bytes(fetch('https://www.unicode.org/license.txt'))
(OUT / 'CC-BY-SA-4.0.txt').write_bytes(fetch('https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt'))
jieba_url = f'https://raw.githubusercontent.com/fxsjy/jieba/{JIEBA_REV}/jieba/dict.txt'
jieba = fetch(jieba_url)
SOURCES.append({'id': 'jieba', 'name': 'Jieba word frequencies', 'author': 'Sun Junyi and contributors',
                'url': 'https://github.com/fxsjy/jieba', 'downloadUrl': jieba_url,
                'version': JIEBA_REV, 'license': 'MIT', 'quality': 'ranking-only',
                'licenseUrl': f'https://github.com/fxsjy/jieba/blob/{JIEBA_REV}/LICENSE',
                **snapshot('jieba.txt.gz', jieba)})
(OUT / 'JIEBA-LICENSE.txt').write_bytes(fetch(f'https://raw.githubusercontent.com/fxsjy/jieba/{JIEBA_REV}/LICENSE'))
(OUT / 'manifest.json').write_text(json.dumps({'schema': 1, 'sources': SOURCES}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'cvdictBytes': len(cv), 'hanVietCharacters': len(hv), 'unicodeCharacters': len(characters), 'sources': len(SOURCES)}))
