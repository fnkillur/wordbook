from pathlib import Path

HEADER = 'rank\ttext\treading\tcount\n'


def katakana_to_hiragana(text: str) -> str:
    return ''.join(chr(ord(char) - 0x60) if 'ァ' <= char <= 'ヶ' else char for char in text)


def rank_rows(counts: dict[str, int], readings: dict[str, str], limit: int) -> list[tuple[int, str, str, int]]:
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
    return [(rank, text, readings.get(text, ''), count) for rank, (text, count) in enumerate(ordered, start=1)]


# 순위가 곧 단어 ID라서, 이미 만든 목록을 실수로 다시 만들어 순위가 바뀌지 않게 막는다.
def write_tsv(path: Path, rows: list[tuple[int, str, str, int]], overwrite: bool) -> None:
    path = Path(path)
    if path.exists() and not overwrite:
        raise FileExistsError(f'{path} 이미 있어요. 순위가 바뀌면 단어 ID가 바뀌니 다시 만들지 않아요.')
    path.write_text(HEADER + ''.join(f'{rank}\t{text}\t{reading}\t{count}\n' for rank, text, reading, count in rows))


def load_lines(path: Path) -> list[str]:
    return [line.strip() for line in Path(path).read_text().splitlines() if line.strip() and not line.startswith('#')]
