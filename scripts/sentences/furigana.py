# 일본어 빈칸 문장의 빈칸 밖 한자에 붙일 읽기(후리가나)를 만든다. 빈칸 말의 읽기는 문장 파일의 읽기 칸을 따로 쓴다.
# 결과 한 줄: 빈칸을 뺀 문장|시작:끝:읽기;시작:끝:읽기…  (위치는 문장 글자 기준, 읽기는 히라가나)
# 형태소 분석이 고른 읽기는 가끔 틀려서(明日 みょうにち), 자주 틀리는 말은 아래 표로 바로잡는다.
# 형태소 분석은 합성어를 잘게 쪼개서(日本語 → 日本+語 にっぽん+ご) 붙은 한자 말은 JMdict에서 통째로 찾아 읽기를 단다.
# 실행: <fugashi가 든 python> -I scripts/sentences/furigana.py <JMdict_e.gz 경로>
import gzip
import re
import sys
import xml.etree.ElementTree as ElementTree
from pathlib import Path

import fugashi

DATA = Path(__file__).resolve().parent.parent / 'data'
KANJI = re.compile(r'[一-鿿々〆ヵヶ]')
KANJI_ONLY = re.compile(r'^[一-鿿々〆]+$')
DIGITS_ONLY = re.compile(r'^[〇一二三四五六七八九]+$')
KANA_RUN = re.compile(r'([ぁ-ゟ゠-ヿー]+)')
MARKED = re.compile(r'^([^[\]]*)\[([^[\]]+)\]([^[\]]*)$')
FIXED_READINGS = {
    '明日': 'あした',
    '今日': 'きょう',
    '昨日': 'きのう',
    '一人': 'ひとり',
    '二人': 'ふたり',
    '大人': 'おとな',
    '今年': 'ことし',
    '今朝': 'けさ',
    '上手': 'じょうず',
    '下手': 'へた',
    '何': 'なに',
    '私': 'わたし',
}

# 사전의 첫 읽기가 문장에서 흔히 쓰는 뜻과 다른 합성어(五分 ごぶ ↔ 五分前 ごふん, 万人 ばんにん ↔ 5000万人 まんにん).
NOT_COMPOUNDS = {'五分', '万人'}


def to_hiragana(text):
    return ''.join(chr(ord(char) - 0x60) if 'ァ' <= char <= 'ヶ' else char for char in text)


# 送り가나가 섞인 말(取り扱い)은 가나 부분을 기준으로 읽기를 잘라 한자 덩어리마다 읽기를 붙인다.
def split_reading(surface, reading):
    runs = [run for run in KANA_RUN.split(surface) if run]
    pattern = ''.join(re.escape(to_hiragana(run)) if KANA_RUN.fullmatch(run) else '(.+?)' for run in runs)
    match = re.fullmatch(pattern, reading)
    if not match:
        return [(0, len(surface), reading)] if not KANA_RUN.search(surface) else []
    spans, position, group = [], 0, 1
    for run in runs:
        if not KANA_RUN.fullmatch(run):
            spans.append((position, position + len(run), match.group(group)))
            group += 1
        position += len(run)
    return [span for span in spans if KANJI.search(surface[span[0]:span[1]])]


# 한자로만 된 표기 → 가장 자주 쓰는 읽기. 표기·읽기에 붙은 빈도 표시(ke_pri·re_pri)로 고른다(日本語 にほんご, 富士山 ふじさん).
def load_compounds(path):
    candidates = {}
    with gzip.open(path) as file:
        for _, entry in ElementTree.iterparse(file):
            if entry.tag != 'entry':
                continue
            for kanji in entry.iter('k_ele'):
                surface = kanji.findtext('keb')
                if not KANJI_ONLY.match(surface):
                    continue
                kanji_rank = 0 if kanji.find('ke_pri') is not None else 1
                for kana in entry.iter('r_ele'):
                    restrictions = [restriction.text for restriction in kana.iter('re_restr')]
                    if kana.find('re_nokanji') is not None or (restrictions and surface not in restrictions):
                        continue
                    kana_rank = 0 if kana.find('re_pri') is not None else 1
                    candidates.setdefault(surface, []).append(((kanji_rank, kana_rank), to_hiragana(kana.findtext('reb'))))
            entry.clear()
    return {surface: min(found, key=lambda item: item[0])[1] for surface, found in candidates.items()}


def tokens_of(tagger, sentence):
    tokens, position = [], 0
    for token in tagger(sentence):
        start = sentence.index(token.surface, position)
        position = start + len(token.surface)
        kana = FIXED_READINGS.get(token.surface) or to_hiragana(getattr(token.feature, 'kana', None) or '')
        tokens.append((start, position, token.surface, kana))
    return tokens


# 한자로만 된 말이 붙어 있으면 사전에 있는 가장 긴 덩어리로 합친다(宇宙人 うちゅうじん, 何日 なんにち).
def merge_compounds(tokens, compounds, boundaries):
    merged, index = [], 0
    while index < len(tokens):
        start, end, surface, kana = tokens[index]
        best = index
        if KANJI_ONLY.match(surface):
            last = index
            while last + 1 < len(tokens) and tokens[last + 1][0] == tokens[last][1] and tokens[last][1] not in boundaries and KANJI_ONLY.match(tokens[last + 1][2]):
                last += 1
                joined = ''.join(token[2] for token in tokens[index : last + 1])
                # 一五〇처럼 한자로 쓴 자릿수는 사전의 一五(じゅうご)와 다르게 읽힌다.
                if joined in compounds and joined not in NOT_COMPOUNDS and not DIGITS_ONLY.match(joined):
                    best = last
        if best > index:
            joined = ''.join(token[2] for token in tokens[index : best + 1])
            merged.append((start, tokens[best][1], joined, compounds[joined]))
        else:
            merged.append((start, end, surface, kana))
        index = best + 1
    return merged


def ruby_of(tagger, compounds, before, answer, after):
    sentence = before + answer + after
    answer_start, answer_end = len(before), len(before) + len(answer)
    spans = []
    for start, end, surface, kana in merge_compounds(tokens_of(tagger, sentence), compounds, {answer_start, answer_end}):
        if not KANJI.search(surface) or (start < answer_end and end > answer_start):
            continue
        if not kana or kana == surface:
            continue
        spans.extend((start + left, start + right, reading) for left, right, reading in split_reading(surface, kana))
    return sentence, spans


def marked_sentences():
    for line in (DATA / 'sentences-ja.txt').read_text(encoding='utf-8').split('\n'):
        if line.strip() and not line.startswith('#'):
            yield line.split('|')[1]
    for line in (DATA / 'conjugations-ja.txt').read_text(encoding='utf-8').split('\n'):
        if line.strip() and not line.startswith('#'):
            yield line.split('|')[2]


def main():
    tagger = fugashi.Tagger()
    compounds = load_compounds(sys.argv[1])
    lines = {}
    for marked in marked_sentences():
        parts = MARKED.match(marked)
        if not parts:
            continue
        sentence, spans = ruby_of(tagger, compounds, *parts.groups())
        if spans:
            lines[sentence] = f'{sentence}|' + ';'.join(f'{start}:{end}:{reading}' for start, end, reading in spans)
    (DATA / 'furigana-ja.txt').write_text('\n'.join(lines.values()) + '\n', encoding='utf-8')
    print(f'후리가나 문장 {len(lines)}개')


main()
