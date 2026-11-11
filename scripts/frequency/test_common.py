import pytest

from common import katakana_to_hiragana, rank_rows, write_tsv


def test_katakana_to_hiragana():
    assert katakana_to_hiragana('タベル') == 'たべる'
    assert katakana_to_hiragana('コーヒー') == 'こーひー'


def test_rank_rows_orders_by_count_then_text():
    assert rank_rows({'a': 3, 'b': 5}, {}, 1) == [(1, 'b', '', 5)]
    assert rank_rows({'b': 2, 'a': 2, 'c': 9}, {'a': 'エー'}, 3) == [(1, 'c', '', 9), (2, 'a', 'エー', 2), (3, 'b', '', 2)]


def test_write_tsv_refuses_to_overwrite(tmp_path):
    path = tmp_path / 'freq.tsv'
    write_tsv(path, [(1, 'a', '', 3)], overwrite=False)
    assert path.read_text() == 'rank\ttext\treading\tcount\n1\ta\t\t3\n'
    with pytest.raises(FileExistsError):
        write_tsv(path, [(1, 'b', '', 3)], overwrite=False)
