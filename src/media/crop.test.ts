import { describe, expect, it } from 'vitest'
import { clampView, cropPlacement, minZoom } from './crop'

const image = { width: 1600, height: 900 }
const frame = { width: 400, height: 300 }
const out = { width: 800, height: 600 }

describe('clampView', () => {
  it('처음에는 칸을 꽉 채우고 가운데에 둔다', () => {
    expect(clampView({ zoom: 1, x: 0, y: 0 }, image, frame)).toEqual({ zoom: 1, x: 0, y: 0 })
  })

  it('그림 전체가 보일 때보다 작게 줄이지 않는다', () => {
    expect(clampView({ zoom: 0.1, x: 0, y: 0 }, image, frame).zoom).toBeCloseTo(minZoom(image, frame))
  })

  it('칸 밖으로 빈 곳이 생기도록 옮기지 않는다', () => {
    const view = clampView({ zoom: 1, x: 999, y: 50 }, image, frame)
    expect(view.x).toBeCloseTo((1600 / 3 - 400) / 2)
    expect(view.y).toBe(0)
  })
})

describe('cropPlacement', () => {
  it('보이는 칸 그대로 저장할 그림 위에 놓는다', () => {
    const placement = cropPlacement({ zoom: 1, x: 0, y: 0 }, image, frame, out)
    expect(placement.width).toBeCloseTo(3200 / 3)
    expect(placement.height).toBeCloseTo(600)
    expect(placement.x).toBeCloseTo(400 - 1600 / 3)
    expect(placement.y).toBeCloseTo(0)
  })

  it('전체가 보이게 줄이면 위아래가 빈 채로 저장한다', () => {
    const placement = cropPlacement({ zoom: minZoom(image, frame), x: 0, y: 0 }, image, frame, out)
    expect(placement.width).toBeCloseTo(800)
    expect(placement.height).toBeCloseTo(450)
    expect(placement.y).toBeCloseTo(75)
  })
})
