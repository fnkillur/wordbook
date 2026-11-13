# 애니·드라마 대사(ImmersionKit) 녹음은 자막 시간대로 잘라서, 문장 끝이 잘려 앞부분만 들리는 것이 있다.
# 말 빠르기(초당 박 수)가 사람이 말할 수 없을 만큼 빠르면 잘린 녹음으로 보고 지운 뒤 clipped-audio.txt에 적는다.
# 적힌 녹음은 fetch_audio.py가 다시 받지 않고, 그 문장은 앱이 TTS로 읽는다. fugashi(unidic-lite)가 필요하다.
import json
import os
import re
import subprocess

import fugashi

MAX_MORAE_PER_SECOND = 9
SMALL_KANA = set('ゃゅょぁぃぅぇぉャュョァィゥェォ')
tagger = fugashi.Tagger()


def morae(text):
    kana = ''.join(word.feature.kana or '' for word in tagger(text) if word.feature.pos1 not in ('補助記号', '空白'))
    return sum(1 for char in kana if char not in SMALL_KANA)


def duration(path):
    match = re.search(r'estimated duration: ([\d.]+)', subprocess.run(['afinfo', path], capture_output=True, text=True).stdout)
    return float(match[1]) if match else 0


def immersionkit_rows():
    for line in open('scripts/data/sentences-ja.txt', encoding='utf-8'):
        cells = line.rstrip('\n').split('|')
        if re.match(r'^\d+$', cells[0]) and cells[3].startswith('I'):
            yield f'ja/{cells[0]}', cells[1].replace('[', '').replace(']', '')
    order = {}
    for line in open('scripts/data/conjugations-ja.txt', encoding='utf-8'):
        cells = line.rstrip('\n').split('|')
        if line.startswith('#') or len(cells) < 5:
            continue
        order[cells[0]] = order.get(cells[0], 0) + 1
        if cells[4].startswith('I'):
            yield f'ja/c/{cells[0]}-{order[cells[0]]}', cells[2].replace('[', '').replace(']', '')


def main():
    listed = 'scripts/data/clipped-audio.txt'
    clipped = {line.strip() for line in open(listed, encoding='utf-8') if line.strip() and not line.startswith('#')} if os.path.exists(listed) else set()
    for name, text in immersionkit_rows():
        path = f'public/sentence-audio/{name}.m4a'
        if not os.path.exists(path):
            continue
        seconds = duration(path)
        if seconds and morae(text) / seconds > MAX_MORAE_PER_SECOND:
            clipped.add(name)
            os.remove(path)
    with open(listed, 'w', encoding='utf-8') as file:
        file.write('# 끝이 잘린 녹음(drop_clipped_audio.py가 찾음). fetch_audio.py가 다시 받지 않고, 앱은 TTS로 읽는다.\n')
        file.write('\n'.join(sorted(clipped)) + '\n')
    print(f'잘린 녹음 {len(clipped)}개')


main()
