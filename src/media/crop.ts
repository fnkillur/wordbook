export type Size = { width: number; height: number }

// zoom 1은 칸을 꽉 채운 크기, x·y는 칸 가운데에서 그림 가운데까지 옮긴 거리(px)다.
export type View = { zoom: number; x: number; y: number }

export type Placement = { x: number; y: number; width: number; height: number }

const MAX_ZOOM = 4

const coverScale = (image: Size, frame: Size) => Math.max(frame.width / image.width, frame.height / image.height)

// 그림 전체가 칸 안에 들어오는 크기까지만 줄일 수 있다.
export const minZoom = (image: Size, frame: Size) => Math.min(frame.width / image.width, frame.height / image.height) / coverScale(image, frame)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const clampView = (view: View, image: Size, frame: Size): View => {
  const zoom = clamp(view.zoom, minZoom(image, frame), MAX_ZOOM)
  const scale = coverScale(image, frame) * zoom
  const limitX = Math.max(0, (image.width * scale - frame.width) / 2)
  const limitY = Math.max(0, (image.height * scale - frame.height) / 2)
  return { zoom, x: clamp(view.x, -limitX, limitX) || 0, y: clamp(view.y, -limitY, limitY) || 0 }
}

// 칸에 보이는 모습 그대로, 저장할 그림(out) 위 어디에 원본을 그릴지 정한다.
export const cropPlacement = (view: View, image: Size, frame: Size, out: Size): Placement => {
  const ratio = out.width / frame.width
  const width = image.width * coverScale(image, frame) * view.zoom * ratio
  const height = image.height * coverScale(image, frame) * view.zoom * ratio
  return { x: (frame.width / 2 + view.x) * ratio - width / 2, y: (frame.height / 2 + view.y) * ratio - height / 2, width, height }
}
