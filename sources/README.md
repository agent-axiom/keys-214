# Data and editorial provenance

The app is an independent Mandarin radical study companion inspired by A. P. Mytsik's book, not a reproduction of the book. The user supplied photographs of the 2006 edition (ISBN 5-89815-554-6).

Book identity, card-based method, and six subject groups:
- https://karo.spb.ru/uchebniki-posobiya-po-inostrannym-yazykam/kitayskiy/214-klyuchevyx-ieroglifov-v-kartinkax-s-kommentariyami-izd-2/
- https://www.litres.ru/book/aleksey-mycik/214-kluchevyh-ieroglifov-v-kartinkah-s-kommentariyami-11283090/

The publisher and Litres sell the complete PDF. Litres advertises a free sample. No verified openly licensed complete edition was identified. We do not reproduce the book's text, historical drawings, or card illustrations. The book is identified by its title, author, publication details, and links to the publisher and Litres. No cover image is bundled in this repository.

## Data

- Unicode 17.0.0 CJKRadicals.txt: https://www.unicode.org/Public/17.0.0/ucd/CJKRadicals.txt
- Unicode 17.0.0 Unihan.zip: https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip
- Chart: https://www.unicode.org/charts/PDF/U2F00.pdf
- Documentation: https://www.unicode.org/reports/tr38/

`radical-facts.json` retains kMandarin, kDefinition, and kTotalStrokes for the 214 compatibility-equivalent unified ideographs, extracted from the official Unihan files. This source data uses Unicode License v3; the full notice is in dist/licenses/unicode.txt. Classical radical stroke group counts are used for cards, rather than modern regional counts from kTotalStrokes.

Russian glosses and mnemonic prompts in content.tsv are original. The six-topic assignments are editorial and do not claim to reproduce the author's grouping. Mnemonics are explicitly not historical etymologies. Examples are an independently selected list of ordinary factual dictionary glosses.

Some characters' default kMandarin reading describes a different sense from the radical. Readings are selected to fit the gloss, checked against Hàn-diǎn:
- 几 jī: https://www.zdic.net/hans/几
- 卜 bǔ: https://www.zdic.net/hans/卜
- 厂 hǎn: https://www.zdic.net/hans/厂
- 干 gān: https://www.zdic.net/hans/干
- 广 yǎn: https://www.zdic.net/hans/广
- 斗 dǒu: https://www.zdic.net/hans/斗
- 艮 gèn: https://www.zdic.net/hans/艮
- 長 cháng: https://www.zdic.net/hans/長
- 鬲 lì: https://www.zdic.net/hans/鬲
- 黽 mǐn: https://zdic.net/hans/%E9%BB%BD

Every card links to its full Hàn-diǎn entry for additional readings and historical forms. The app only claims one selected Mandarin reading, not a complete pronunciation dictionary. Japanese readings are outside the implemented scope.

## Font

Noto Serif SC, served locally as a Google Fonts character subset. The original SIL Open Font License is retained in dist/licenses/noto-serif-sc.txt. Source: https://github.com/notofonts/noto-cjk

## Regeneration

Run `python build-data.py` to reproduce dist/data.js from the retained facts and original content. No external API is called by the application at runtime; only source links open external sites. Book cover and font assets are local.
