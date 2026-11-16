# 일본어 빈칸 문장의 빈칸 밖 한자에 붙일 읽기(후리가나)를 만든다. 빈칸 말의 읽기는 문장 파일의 읽기 칸을 따로 쓴다.
# 결과 한 줄: 빈칸을 뺀 문장|시작:끝:읽기;시작:끝:읽기…  (위치는 문장 글자 기준, 읽기는 히라가나)
# 형태소 분석이 고른 읽기는 가끔 틀려서(明日 みょうにち), 자주 틀리는 말은 아래 표로 바로잡는다.
# 실행: <fugashi가 든 python> -I scripts/sentences/furigana.py
import re
from pathlib import Path

import fugashi

DATA = Path(__file__).resolve().parent.parent / 'data'
KANJI = re.compile(r'[一-鿿々〆ヵヶ]')
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
}


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


def ruby_of(tagger, before, answer, after):
    sentence = before + answer + after
    answer_start, answer_end = len(before), len(before) + len(answer)
    spans, position = [], 0
    for token in tagger(sentence):
        start = sentence.index(token.surface, position)
        end = start + len(token.surface)
        position = end
        if not KANJI.search(token.surface) or (start < answer_end and end > answer_start):
            continue
        kana = FIXED_READINGS.get(token.surface) or to_hiragana(getattr(token.feature, 'kana', None) or '')
        if not kana or kana == token.surface:
            continue
        spans.extend((start + left, start + right, reading) for left, right, reading in split_reading(token.surface, kana))
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
    lines = {}
    for marked in marked_sentences():
        parts = MARKED.match(marked)
        if not parts:
            continue
        sentence, spans = ruby_of(tagger, *parts.groups())
        if spans:
            lines[sentence] = f'{sentence}|' + ';'.join(f'{start}:{end}:{reading}' for start, end, reading in spans)
    (DATA / 'furigana-ja.txt').write_text('\n'.join(lines.values()) + '\n', encoding='utf-8')
    print(f'후리가나 문장 {len(lines)}개')


main()
