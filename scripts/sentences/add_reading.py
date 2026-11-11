# 일본어 문장 파일의 빈칸 말에 문장 속 꼴 그대로의 읽기(히라가나)를 다섯째 칸으로 붙인다.
# 형태소 분석이 고른 읽기는 틀릴 때가 있어서(何 なに/なん), 붙인 뒤 사람이 훑어 고친다. 이미 있는 칸은 덮어쓰지 않는다.
# 실행: <fugashi가 든 python> -I scripts/sentences/add_reading.py scripts/data/sentences-ja.txt
import re
import sys

import fugashi

KANA = re.compile(r'^[ぁ-ゟ゠-ヿー]+$')


def to_hiragana(text):
    return ''.join(chr(ord(char) - 0x60) if 'ァ' <= char <= 'ヶ' else char for char in text)


def blank_reading(tagger, marked):
    start = marked.index('[')
    end = marked.index(']') - 1
    sentence = marked.replace('[', '').replace(']', '')
    answer = sentence[start:end]
    if KANA.match(answer):
        return to_hiragana(answer)
    reading, position = [], 0
    for token in tagger(sentence):
        token_start = sentence.index(token.surface, position)
        token_end = token_start + len(token.surface)
        position = token_end
        if token_end <= start or token_start >= end:
            continue
        kana = getattr(token.feature, 'kana', None) or token.surface
        if token_start < start or token_end > end:
            raise ValueError(f'빈칸이 형태소 중간에서 끊겨요: {marked}')
        reading.append(kana)
    return to_hiragana(''.join(reading))


def main(path):
    tagger = fugashi.Tagger()
    lines = open(path, encoding='utf-8').read().split('\n')
    output = []
    for line in lines:
        cells = line.split('|')
        if line.startswith('#') or len(cells) != 4:
            output.append(line)
            continue
        try:
            output.append(f'{line}|{blank_reading(tagger, cells[1])}')
        except ValueError as error:
            print(error)
            output.append(f'{line}|')
    open(path, 'w', encoding='utf-8').write('\n'.join(output))


main(sys.argv[1])
