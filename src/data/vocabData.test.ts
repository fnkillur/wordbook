import { describe, expect, it } from 'vitest'
import { TEST_WORDS } from './vocabTest'

describe('어휘량 테스트 표본', () => {
  it.each(['ja', 'en'] as const)('%s: 10구간 × 두 벌 × 20개, 모두 뜻이 있고 순위가 구간 안에 있다', language => {
    const words = TEST_WORDS[language]

    expect(words).toHaveLength(400)
    for (let band = 0; band < 10; band += 1) {
      for (const set of [0, 1] as const) {
        expect(words.filter(word => word.band === band && word.set === set)).toHaveLength(20)
      }
    }
    words.forEach(word => {
      expect(word.meaningKo.trim()).not.toBe('')
      expect(word.rank).toBeGreaterThanOrEqual(word.band * 1000 + 1)
      expect(word.rank).toBeLessThanOrEqual((word.band + 1) * 1000)
    })
  })
})
