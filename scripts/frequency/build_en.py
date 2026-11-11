# 영어 자막 빈도 목록(hermitdave FrequencyWords en_50k, OpenSubtitles 2018)을 표제어로 묶어 상위 10,000개를 고정한다.
# 실행: python build_en.py <en_50k.txt> <cmudict.dict> [--overwrite]
import json
import re
import sys
from collections import Counter
from pathlib import Path

import spacy

from common import load_lines, rank_rows, write_tsv

ROOT = Path(__file__).resolve().parents[2]
LIMIT = 10_000
SKIP_POS = {'PROPN', 'NUM', 'INTJ', 'PUNCT', 'SYM', 'X', 'DET', 'PRON', 'ADP', 'CCONJ', 'SCONJ', 'AUX', 'PART', 'SPACE'}
SYSTEM_WORDS = Path('/usr/share/dict/words')

VOWELS = {
    'AA': 'ɑ', 'AE': 'æ', 'AO': 'ɔ', 'AW': 'aʊ', 'AY': 'aɪ', 'EH': 'ɛ', 'EY': 'eɪ',
    'IH': 'ɪ', 'IY': 'i', 'OW': 'oʊ', 'OY': 'ɔɪ', 'UH': 'ʊ', 'UW': 'u',
}
CONSONANTS = {
    'B': 'b', 'CH': 'tʃ', 'D': 'd', 'DH': 'ð', 'F': 'f', 'G': 'ɡ', 'HH': 'h', 'JH': 'dʒ', 'K': 'k', 'L': 'l',
    'M': 'm', 'N': 'n', 'NG': 'ŋ', 'P': 'p', 'R': 'r', 'S': 's', 'SH': 'ʃ', 'T': 't', 'TH': 'θ', 'V': 'v',
    'W': 'w', 'Y': 'j', 'Z': 'z', 'ZH': 'ʒ',
}


ONSETS = {
    'pr', 'br', 'tr', 'dr', 'kr', 'ɡr', 'fr', 'θr', 'ʃr', 'pl', 'bl', 'kl', 'ɡl', 'fl', 'sl', 'sp', 'st', 'sk', 'sm', 'sn',
    'sw', 'tw', 'kw', 'dw', 'pj', 'bj', 'kj', 'fj', 'mj', 'hj', 'spr', 'str', 'skr', 'spl', 'skw',
}


# 강세 표시는 음절 첫소리 앞에 둔다(prophecy → ˈprɑfəsi). 앞 자음 중 첫소리로 붙을 수 있는 만큼만 가져온다.
def onset_length(parts: list[str]) -> int:
    consonants = 0
    while consonants < len(parts) and parts[len(parts) - 1 - consonants] in CONSONANTS.values():
        consonants += 1
    for length in (3, 2):
        if consonants >= length and ''.join(parts[-length:]) in ONSETS:
            return length
    return min(consonants, 1)


def vowel_ipa(phone: str, stress: str) -> str:
    if phone == 'AH':
        return 'ə' if stress == '0' else 'ʌ'
    if phone == 'ER':
        return 'ər' if stress == '0' else 'ɝ'
    return VOWELS[phone]


# 기초 625와 같은 표기: 여러 음절이면 강세 음절 앞에 ˈ, 한 음절이면 표시 없음.
def arpabet_to_ipa(phones: list[str]) -> str:
    parts: list[str] = []
    syllables = sum(1 for phone in phones if phone[-1].isdigit())
    for phone in phones:
        base, stress = re.match(r'([A-Z]+)([012]?)', phone).groups()
        if not stress:
            parts.append(CONSONANTS[base])
            continue
        if stress == '1' and syllables > 1:
            parts.insert(len(parts) - onset_length(parts), 'ˈ')
        parts.append(vowel_ipa(base, stress))
    return ''.join(parts)


def load_cmudict(path: Path) -> dict[str, str]:
    pronunciations: dict[str, str] = {}
    for line in Path(path).read_text().splitlines():
        word, *phones = line.split('#')[0].split()
        if '(' in word or word in pronunciations:
            continue
        pronunciations[word] = arpabet_to_ipa(phones)
    return pronunciations


# 자막 목록은 모두 소문자라 사람 이름을 품사로 못 거른다. 사전에 대문자로만 있는 단어(Michael)는 이름으로 본다.
def proper_names() -> set[str]:
    if not SYSTEM_WORDS.exists():
        return set()
    words = set(SYSTEM_WORDS.read_text().split())
    return {word.lower() for word in words if word[0].isupper() and word.lower() not in words}


def base_words() -> set[str]:
    base = json.loads((ROOT / 'scripts/data/base625.json').read_text())
    return {re.sub(r'\s*\([^)]*\)', '', item['en']).strip().lower() for item in base}


def main() -> None:
    source, cmudict, overwrite = Path(sys.argv[1]), Path(sys.argv[2]), '--overwrite' in sys.argv
    rows = [line.split() for line in source.read_text().splitlines() if line.strip()]
    names = proper_names()
    excluded = base_words() | set(load_lines(Path(__file__).with_name('exclude-en.txt')))
    nlp = spacy.load('en_core_web_sm', disable=['parser', 'ner'])

    counts: Counter[str] = Counter()
    for (word, count), doc in zip(rows, nlp.pipe(word for word, _ in rows)):
        if "'" in word or not word.isalpha() or (len(word) == 1 and word not in {'a', 'i'}) or word in names:
            continue
        token = doc[0]
        if len(doc) != 1 or token.pos_ in SKIP_POS:
            continue
        counts[token.lemma_.lower()] += int(count)

    kept = {text: count for text, count in counts.items() if text not in excluded}
    write_tsv(ROOT / 'scripts/data/freq-en.tsv', rank_rows(kept, load_cmudict(cmudict), LIMIT), overwrite)
    print(f'{min(len(kept), LIMIT)}개를 썼어요')


if __name__ == '__main__':
    main()
