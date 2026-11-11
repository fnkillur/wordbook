# 일본어 자막 말뭉치(OPUS OpenSubtitles 2018 일본어 단일어 텍스트)에서 표제어 빈도를 세어 상위 10,000개를 고정한다.
# 실행: python build_ja.py <ja.txt.gz> [--overwrite]
import gzip
import sys
from collections import Counter, defaultdict
from pathlib import Path

import fugashi

from common import katakana_to_hiragana, load_lines, rank_rows, write_tsv

ROOT = Path(__file__).resolve().parents[2]
LIMIT = 10_000
SKIP_POS1 = {'助詞', '助動詞', '記号', '補助記号', '空白', '感動詞', '接頭辞', '接尾辞'}
SKIP_POS2 = {'固有名詞', '数詞'}


def is_single_kana(text: str) -> bool:
    return len(text) == 1 and ('ぁ' <= text <= 'ゖ' or 'ァ' <= text <= 'ヶ')


def base_words() -> set[str]:
    return {line.split('|')[1].strip() for line in load_lines(ROOT / 'scripts/data/words.txt')}


def main() -> None:
    source, overwrite = Path(sys.argv[1]), '--overwrite' in sys.argv
    tagger = fugashi.Tagger()
    counts: Counter[tuple[str, str]] = Counter()
    spellings: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    with gzip.open(source, 'rt', encoding='utf-8') as lines:
        for line in lines:
            for word in tagger(line.strip()):
                feature = word.feature
                if feature.pos1 in SKIP_POS1 or feature.pos2 in SKIP_POS2 or not feature.lemma:
                    continue
                # 표제어만으로 묶으면 止める가 やめる·とめる를 함께 삼켜서, 발음까지 같아야 같은 단어로 본다.
                key = (feature.lemma.split('-')[0], feature.kanaBase or feature.lForm or '')
                counts[key] += 1
                spellings[key][feature.orthBase or word.surface] += 1

    # 표제어 대신 자막에서 가장 많이 쓴 표기로 보여 준다(為る → する).
    shown: Counter[str] = Counter()
    shown_readings: dict[str, str] = {}
    for key, count in counts.most_common():
        text = spellings[key].most_common(1)[0][0]
        shown[text] += count
        shown_readings.setdefault(text, katakana_to_hiragana(key[1]))

    excluded = base_words() | set(load_lines(Path(__file__).with_name('exclude-ja.txt')))
    kept = {text: count for text, count in shown.items() if text not in excluded and not is_single_kana(text)}
    rows = rank_rows(kept, shown_readings, LIMIT)
    write_tsv(ROOT / 'scripts/data/freq-ja.tsv', rows, overwrite)
    print(f'{len(rows)}개를 썼어요')


if __name__ == '__main__':
    main()
