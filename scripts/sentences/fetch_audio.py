# 문장 파일에서 원어민 녹음이 있는 문장(Kaishi K, ImmersionKit I<id>, Tatoeba T<id>)의 녹음을 받아
# public/sentence-audio/<lang>/<순위>.m4a 로 작게 다시 압축한다. 파일이 있는지가 곧 "녹음 있음"이라서(build-words.mjs),
# 받지 못한 문장은 파일 없이 두고 마지막에 순위를 적는다. 그 문장은 앱이 TTS로 읽는다.
# 원본(덱·검색 결과·CSV)은 저장소 밖에 두고 경로로 넘긴다. macOS afconvert와 zstd가 필요하다.
import argparse
import json
import os
import re
import sqlite3
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile

ENCODE = ['afconvert', '-f', 'm4af', '-d', 'aac', '-c', '1', '-b', '24000']
ZSTD_MAGIC = b'\x28\xb5\x2f\xfd'
IMMERSIONKIT_MEDIA = 'https://immersionkit.s3.bhs.io.cloud.ovh.net/media/'


def unzstd(data):
    return subprocess.run(['zstd', '-d', '-c'], input=data, capture_output=True, check=True).stdout


def varint(data, position):
    result = shift = 0
    while True:
        byte = data[position]
        position += 1
        result |= (byte & 0x7F) << shift
        shift += 7
        if byte < 0x80:
            return result, position


# Anki media 목록: MediaEntries { repeated MediaEntry entries = 1 } / MediaEntry { string name = 1; ... }. zip 안 파일 이름은 순번이다.
def media_names(raw):
    names, position = [], 0
    while position < len(raw):
        _, position = varint(raw, position)
        length, position = varint(raw, position)
        entry, position = raw[position:position + length], position + length
        inner, name = 0, ''
        while inner < len(entry):
            field, inner = varint(entry, inner)
            if field & 7 == 2:
                size, inner = varint(entry, inner)
                if field >> 3 == 1:
                    name = entry[inner:inner + size].decode()
                inner += size
            else:
                _, inner = varint(entry, inner)
        names.append(name)
    return names


def strip_tags(text):
    return re.sub(r'<[^>]+>', '', text).replace('&nbsp;', ' ').strip()


def kaishi_reader(apkg_path):
    archive = zipfile.ZipFile(apkg_path)
    with tempfile.NamedTemporaryFile(suffix='.sqlite') as database:
        database.write(unzstd(archive.read('collection.anki21b')))
        database.flush()
        notes = sqlite3.connect(database.name).execute('select flds from notes').fetchall()
    sound_by_sentence = {}
    for (fields,) in notes:
        parts = fields.split('\x1f')
        if len(parts) < 9:
            continue
        sound = re.search(r'\[sound:([^\]]+)\]', parts[8])
        if sound:
            sound_by_sentence[strip_tags(parts[5])] = sound[1]
    index_by_name = {name: str(index) for index, name in enumerate(media_names(unzstd(archive.read('media'))))}

    def read(sentence):
        name = sound_by_sentence.get(sentence)
        if not name or name not in index_by_name:
            return None
        data = archive.read(index_by_name[name])
        return unzstd(data) if data.startswith(ZSTD_MAGIC) else data

    return read


def immersionkit_reader(site_script_path, cache_dir):
    # 숫자로 시작하는 슬러그는 따옴표로 감싸여 있고, 제목에는 \xd7 같은 이스케이프가 섞여 있다.
    pairs = re.findall(r'"?(\w+)"?:\{title:"((?:[^"\\]|\\.)*)",category:"\w+"', open(site_script_path, encoding='utf-8', errors='replace').read())
    titles = {slug: re.sub(r'\\x([0-9a-fA-F]{2})', lambda match: chr(int(match[1], 16)), title) for slug, title in pairs}
    sounds = {}
    for name in os.listdir(cache_dir):
        for example in json.load(open(os.path.join(cache_dir, name), encoding='utf-8')):
            sounds[example['id']] = example.get('sound')

    def read(example_id):
        category = example_id.split('_')[0]
        slug = '_'.join(example_id.split('_')[1:-1])
        # 게임 대사는 ogg라 afconvert가 읽지 못한다(빈 소리가 된다). mp3만 받는다.
        if not (sounds.get(example_id) or '').endswith('.mp3') or slug not in titles:
            return None
        url = IMMERSIONKIT_MEDIA + urllib.parse.quote(f'{category}/{titles[slug]}/media/{sounds[example_id]}')
        return download(url)

    return read


def tatoeba_reader(csv_path):
    audio_ids = {}
    for line in open(csv_path, encoding='utf-8'):
        cells = line.split('\t')
        if len(cells) > 1 and cells[1].strip():
            audio_ids.setdefault(cells[0], cells[1].strip())

    def read(sentence_id):
        audio_id = audio_ids.get(sentence_id)
        return download(f'https://tatoeba.org/audio/download/{audio_id}') if audio_id else None

    return read


def download(url):
    time.sleep(0.3)
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        return urllib.request.urlopen(request, timeout=60).read()
    except Exception:
        return None


def encode(data, target):
    with tempfile.NamedTemporaryFile(suffix='.mp3') as source:
        source.write(data)
        source.flush()
        result = subprocess.run([*ENCODE, source.name, target], capture_output=True)
    return result.returncode == 0 and os.path.getsize(target) > 0


def sentence_rows(path):
    for line in open(path, encoding='utf-8'):
        cells = line.rstrip('\n').split('|')
        if line.startswith('#') or len(cells) < 4:
            continue
        yield cells[0], cells[1].replace('[', '').replace(']', ''), cells[3]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--kaishi', required=True)
    parser.add_argument('--immersionkit-js', required=True)
    parser.add_argument('--immersionkit-cache', required=True)
    parser.add_argument('--tatoeba-audio', required=True)
    parser.add_argument('--data', default='scripts/data')
    parser.add_argument('--out', default='public/sentence-audio')
    args = parser.parse_args()

    readers = {'K': kaishi_reader(args.kaishi), 'I': immersionkit_reader(args.immersionkit_js, args.immersionkit_cache), 'T': tatoeba_reader(args.tatoeba_audio)}
    for language in ('ja', 'en'):
        os.makedirs(os.path.join(args.out, language), exist_ok=True)
        saved, failed = 0, []
        for rank, sentence, source in sentence_rows(os.path.join(args.data, f'sentences-{language}.txt')):
            kind = source[:1]
            if kind not in readers or source in ('self',):
                continue
            target = os.path.join(args.out, language, f'{rank}.m4a')
            if os.path.exists(target):
                saved += 1
                continue
            data = readers[kind](sentence if kind == 'K' else source[1:])
            if data and encode(data, target):
                saved += 1
            else:
                failed.append(rank)
        print(f'{language}: {saved}개 저장, 실패 {len(failed)}개 {failed}')


main()
