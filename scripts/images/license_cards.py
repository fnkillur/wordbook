"""자격증 그림의 급수 숫자만 바꾼 복사본을 급수(1~5)별로 만든다. 원본은 그대로 둔다.

python license_cards.py <원본 폴더> <출력 폴더> <Hannotate.ttc> <BMJua-Regular.otf>
글꼴은 macOS에 들어 있는 것을 쓴다(하치와레: Hannotate, 우사기: BM주아).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

src, out, hannotate, jua = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]

# 원본, 숫자를 지울 영역, 숫자 가운데, 글꼴(경로, 번호), 크기, 색, 기울기(반시계 도), 획 두께
CARDS = {
    'hachiware': ('하치와레-5급.jpg', (232, 372, 312, 462), (271, 415), (hannotate, 1), 96, (52, 40, 36), 0, 0),
    'usagi': ('우사기-자격증.jpg', (456, 836, 578, 992), (510, 913), (jua, 0), 128, (58, 34, 30), 14, 2),
}


def load_font(path, index, size):
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.truetype(path, size, index=0)


# 숫자 양옆 카드 바탕색의 중앙값으로 숫자 자리를 칠한다.
def background_of(image, box, pad=10):
    left, top, right, bottom = box
    strips = [image.crop((left - pad, top, left, bottom)), image.crop((right, top, right + pad, bottom))]
    pixels = [pixel for strip in strips for pixel in strip.get_flattened_data()]
    return tuple(sorted(channel)[len(channel) // 2] for channel in zip(*pixels))


for name, (file, box, center, (font_path, font_index), size, color, angle, stroke) in CARDS.items():
    base = Image.open(src / file).convert('RGB')
    mask = Image.new('L', base.size, 0)
    ImageDraw.Draw(mask).rectangle(box, fill=255)
    erased = Image.composite(Image.new('RGB', base.size, background_of(base, box)), base, mask.filter(ImageFilter.GaussianBlur(4)))
    font = load_font(font_path, font_index, size)
    for grade in range(1, 6):
        layer = Image.new('RGBA', (size * 2, size * 2), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((size, size), str(grade), font=font, fill=color + (255,), anchor='mm', stroke_width=stroke, stroke_fill=color + (255,))
        card = erased.copy()
        card.paste(layer.rotate(angle, resample=Image.BICUBIC), (center[0] - size, center[1] - size), layer.rotate(angle, resample=Image.BICUBIC))
        card.thumbnail((640, 640))
        card.save(out / f'license-{name}-{grade}.webp', 'WEBP', quality=85)
