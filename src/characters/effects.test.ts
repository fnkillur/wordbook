import { describe, expect, it } from 'vitest'
import { BASE_EFFECTS, BASE_VIDEOS, pickCelebration, pickImage, showFor } from './effects'

describe('10장마다 효과', () => {
  it('기본 움짤 5개와 롤링 영상은 처음부터 후보다', () => {
    expect(BASE_EFFECTS.map(effect => effect.name)).toEqual(['우사기 국물먹기', '우사기 뒹굴쳐다보기', '쿠리만쥬 캬아', '시사 술공부', '시사 방긋'])
    expect(pickCelebration([], () => 0)).toMatchObject({ kind: 'image', src: BASE_EFFECTS[0].src })
    expect(pickCelebration([], () => 0.999)).toEqual({ kind: 'video', src: BASE_VIDEOS[0].src })
    expect(BASE_VIDEOS[0].src).toContain('rolling')
  })

  it('도감에서 열린 효과 영상도 같은 후보에 더해진다', () => {
    expect(pickCelebration(['effect.mp4'], () => 0.999)).toEqual({ kind: 'video', src: 'effect.mp4' })
  })
})

describe('움짤 보여 주는 시간', () => {
  it('한 바퀴 단위로, 2초를 넘길 때까지 돌리고 긴 건 한 바퀴를 다 보여 준다', () => {
    expect(showFor(400)).toBe(2000)
    expect(showFor(1300)).toBe(2600)
    expect(showFor(3500)).toBe(3500)
  })

  it('고른 움짤에는 그 움짤에 맞는 보여 주는 시간이 붙는다', () => {
    const [first] = BASE_EFFECTS
    expect(pickCelebration([], () => 0).durationMs).toBe(showFor(first.loopMs))
    expect(pickImage([{ name: '다독임', src: 'tough.webp', loopMs: 3000 }], () => 0)).toEqual({ kind: 'image', src: 'tough.webp', durationMs: 3000 })
  })
})

