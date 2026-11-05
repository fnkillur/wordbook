import { describe, expect, it } from 'vitest'
import { fitSize } from './image'

describe('fitSize', () => {
  it('긴 쪽을 800px에 맞춰 비율대로 줄인다', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 800, height: 600 })
    expect(fitSize(1000, 4000)).toEqual({ width: 200, height: 800 })
  })

  it('작은 이미지는 그대로 둔다', () => {
    expect(fitSize(640, 480)).toEqual({ width: 640, height: 480 })
  })
})
