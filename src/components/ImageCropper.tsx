import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { clampView, cropPlacement, type Placement, type Size, type View } from '../media/crop'
import { CARD_IMAGE_SIZE } from '../media/image'

type Point = { x: number; y: number }
type Gesture = { view: View; center: Point; distance: number }

const centerOf = (points: Point[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
})

const distanceOf = (points: Point[]) => (points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y))

// 한 손가락으로 끌어 옮기고, 두 손가락(웹은 휠)으로 키우거나 줄인다. 보이는 모습이 그대로 저장된다.
function ImageCropper({ url, onPlacementChange }: { url: string; onPlacementChange: (placement: Placement | null, isAdjusted: boolean) => void }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)

  const [layout, setLayout] = useState<{ image: Size | null; frame: Size | null; view: View; isAdjusted: boolean }>({ image: null, frame: null, view: { zoom: 1, x: 0, y: 0 }, isAdjusted: false })

  const { image, frame } = layout
  const shown = image && frame ? clampView(layout.view, image, frame) : null
  const view = shown ?? layout.view

  // 그림 크기와 칸 크기가 거의 동시에 들어와도 서로 덮어쓰지 않게, 최신 값은 ref에 모아 두고 화면만 state로 그린다.
  const latest = useRef(layout)

  // 칸 크기·그림 크기·위치가 바뀔 때마다 저장할 모습을 함께 알린다.
  const update = (next: Partial<typeof layout>) => {
    const merged = { ...latest.current, ...next }
    latest.current = merged
    setLayout(merged)
    if (!merged.image || !merged.frame) return onPlacementChange(null, merged.isAdjusted)
    onPlacementChange(cropPlacement(clampView(merged.view, merged.image, merged.frame), merged.image, merged.frame, CARD_IMAGE_SIZE), merged.isAdjusted)
  }
  const updateRef = useRef(update)

  useEffect(() => {
    updateRef.current = update
  })

  useEffect(() => {
    const element = frameRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => updateRef.current({ frame: { width: entry.contentRect.width, height: entry.contentRect.height } }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const startGesture = () => {
    const points = [...pointers.current.values()]
    gesture.current = points.length ? { view, center: centerOf(points), distance: distanceOf(points) } : null
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    startGesture()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current || !image || !frame) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.current.values()]
    const start = gesture.current
    const center = centerOf(points)
    const zoom = start.distance && points.length > 1 ? start.view.zoom * (distanceOf(points) / start.distance) : start.view.zoom
    update({ isAdjusted: true, view: clampView({ zoom, x: start.view.x + center.x - start.center.x, y: start.view.y + center.y - start.center.y }, image, frame) })
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    startGesture()
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!image || !frame) return
    update({ isAdjusted: true, view: clampView({ ...view, zoom: view.zoom * Math.exp(-event.deltaY * 0.002) }, image, frame) })
  }

  const style =
    shown && image && frame
      ? {
          width: image.width * Math.max(frame.width / image.width, frame.height / image.height) * shown.zoom,
          height: image.height * Math.max(frame.width / image.width, frame.height / image.height) * shown.zoom,
          transform: `translate(calc(-50% + ${shown.x}px), calc(-50% + ${shown.y}px))`,
        }
      : undefined

  return (
    <div
      ref={frameRef}
      className="image-cropper"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <img src={url} alt="고른 그림" draggable={false} style={style} onLoad={event => update({ image: { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight } })} />
    </div>
  )
}

export default ImageCropper
