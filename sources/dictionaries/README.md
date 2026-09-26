# Pinned open dictionary sources

These snapshots are data, never executable code. `manifest.json` records origin,
revision, license and SHA-256 of the uncompressed snapshot. The normal build is
offline and verifies these hashes before importing. Source licenses apply to the
data independently of the website's code.

| Dataset | Attribution | License | Snapshot |
| --- | --- | --- | --- |
| CVDICT | Phong Phan; CC-CEDICT contributors, originating with Paul Denisowski | CC BY-SA 4.0 | `c379d909e308343a247e51619f7839a2060a271c` |
| Hán Việt Pinyin | Phong Phan | MIT | `a1292b0fdfbfeed41e08ae53e8bc4e01167bed28` of `hanviet-pinyin-words` |
| Unihan / CJK radicals | Unicode, Inc. | Unicode-3.0 | Unicode 17.0.0 |
| Jieba dictionary frequencies | Sun Junyi and contributors | MIT | `67fa2e36e72f69d9134b8a1037b83fbb070b9775` |

## Import transformations

`scripts/fetch-study-sources.py` is an explicit maintenance command that downloads
the pinned files and licenses. It parses the Hán Việt JavaScript export as JSON,
without evaluating it. Unihan is restricted to the listed character metadata
fields in that script. Gzip is only a lossless transport wrapper.

`scripts/build-study-lexicon.mjs` makes compact, content-hashed JSON and gzip in
`data/study/lexicon/`, copies attribution and license files, and writes the public
manifest. Changes to any pinned source must update tests and be reviewed.

- All 122,597 CVDICT rows are parsed; one identical headword/pronunciation pair is
  merged, preserving the union of definitions. The result is 119,044 unique
  simplified headwords and 122,596 traditional-form/pronunciation groups.
- Source line 67,267 has duplicated pinyin brackets. The parser removes those
  brackets only; it preserves the definition and records the correction. Other
  malformed lines fail the build rather than being silently skipped.
- Numbered pinyin is displayed with tone marks. Classifiers stay separate from
  definitions. Definitions are not rewritten. Normalized strings support search.
  Equal-score hits favor course words, then Jieba frequency weights and words composed of common characters;
  exact Vietnamese-meaning ties prefer two-character words over isolated glyphs.
  This is a search heuristic, not a claim about word frequency or HSK level.
- Hán Việt is mapped from the traditional form and its corresponding numbered
  pinyin. Missing mappings are left empty. Multiple readings and traditional
  variants remain explicit. Word readings are assembled, not translations.
- The union of Unihan, CVDICT single characters and Hán Việt data contains 103,013
  Han characters. 10,540 have a direct Hán Việt mapping; 13,610 have one after
  following explicit Unicode traditional mappings. These counts are not HSK
  levels or counts of fully translated/teacher-reviewed entries.
- Unihan `kVietnamese` remains a separate field, never an inferred Hán Việt
  reading. `kTGH` identifies 8,105 common characters in the 2013 table, not HSK.

The transformed CVDICT component is distributed under CC BY-SA 4.0. Attribution,
license links, source versions and transformation notes appear on the site's
`nguon-tu-dien.html` page and in every dictionary card that uses the data. The
Hán Việt and Unicode components retain their respective licenses; their source
fields remain identifiable in the compact schema and public manifest.

## Editorial limits

CVDICT's author explicitly describes substantial AI-assisted translation and
remaining errors, especially proper names. Its imported definitions are labeled
reference material. Existing course definitions and examples remain primary and
retain lesson provenance. Imported alternate readings appear separately.
No new AI translation, API call, or fabricated example is used in this import.

Hanzii and Thi Viện are external lookup destinations. This project does not copy
their full proprietary dictionary contents. The upstream Hán Việt wordlist names
several traditional dictionaries, including Thi Viện, as research references;
see the upstream README for that source history.

## Runtime

Public lexicon data is loaded lazily in a module Web Worker. Gzip transfer is used
when `DecompressionStream` is supported; raw JSON is available as a fallback.
Only result pages cross the worker boundary. Course-only fallback shows a visible
warning when the expanded corpus is unavailable. Supabase continues to hold
private course records and users' saved words/characters; imported public words
can be saved as snapshots under existing owner-only RLS.

Compact word rows: `[simplified, [[traditional, numberedPinyin, definitions,
hanViet], ...], normalizedSearchTextOrNull, allCharactersInCommonTable, jiebaFrequency]`.
The build leaves the normalized search text null; the worker derives it from
definitions and Hán Việt on load, avoiding a second download of the same meanings.

Compact character rows: `[character, pinyin, strokeCount, radical, radicalNumber,
traditionalForms, simplifiedForms, unihanVietnameseReadings, unihanDefinitionEn,
kTghRank, [[hanVietSourceForm, numberedPinyinOrStar, readings], ...], meaningsVi]`.

The union character component includes CVDICT-derived Vietnamese definitions;
those fields remain CC BY-SA 4.0. Whole converted corpus downloads are linked from
the source page for attribution, inspection and reuse.
