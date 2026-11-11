import { describe, expect, it } from 'vitest'
import { earnedOf, pastCoins } from './wallet'

describe('wallet', () => {

  it('이전 버전에서 한 복습과 만든 단어만큼 보수를 채워 준다', () => {
    const coins = pastCoins([{ cardId: 'ja-0001:produce', grade: 'good', at: '2026-11-05T00:00:00.000Z' }], [{ wordId: 'ja-0001', memo: '', audioSource: null, madeAt: '2026-11-04T00:00:00.000Z', updatedAt: '' }])

    expect(coins).toEqual([
      { id: 'review:ja-0001:produce|2026-11-05T00:00:00.000Z', kind: 'review', amount: 1, at: '2026-11-05T00:00:00.000Z' },
      { id: 'make:ja-0001', kind: 'make', amount: 5, at: '2026-11-04T00:00:00.000Z' },
    ])
  })
})

describe('모은 보수', () => {
  it('도감은 쓴 것을 빼지 않고 받은 보수만 더한다', () => {
    const coins = [
      { id: 'make:ja-0001', kind: 'make' as const, amount: 5, at: '' },
      { id: 'review:x', kind: 'review' as const, amount: 1, at: '' },
      { id: 'buy:fallen-leaf', kind: 'buy' as const, amount: -100, at: '' },
    ]
    expect(earnedOf(coins)).toBe(6)
  })
})
