import { describe, expect, it } from 'vitest'
import { estimateKnown, isBandDone, nextSet, shouldStop, spreadOrder, suggestStartRank, summarize, type BandScore } from './vocabTest'

const score = (band: number, known: number, total = 20): BandScore => ({ band, known, total })

describe('어휘량 테스트 계산', () => {
  it('두 구간 연속으로 아는 비율이 50% 아래면 일찍 끝낸다', () => {
    expect(shouldStop([score(0, 18), score(1, 9), score(2, 8)])).toBe(true)
    expect(shouldStop([score(0, 18), score(1, 9)])).toBe(false)
    expect(shouldStop([score(0, 9)])).toBe(false)
  })

  it('구간의 처음 10개를 다 알면 나머지를 건너뛰고, 하나라도 모르면 20개를 다 본다', () => {
    expect(isBandDone({ answered: 10, known: 10, total: 20 })).toBe(true)
    expect(isBandDone({ answered: 10, known: 9, total: 20 })).toBe(false)
    expect(isBandDone({ answered: 15, known: 15, total: 20 })).toBe(false)
    expect(isBandDone({ answered: 20, known: 12, total: 20 })).toBe(true)
  })

  it('처음 10개가 구간 전체에 고루 퍼지게 순서를 섞는다', () => {
    expect(spreadOrder([1, 2, 3, 4, 5, 6])).toEqual([1, 3, 5, 2, 4, 6])
  })

  it('10구간을 다 보면 끝낸다', () => {
    expect(shouldStop(Array.from({ length: 10 }, (_, band) => score(band, 20)))).toBe(true)
  })

  it('구간별 아는 비율로 아는 단어 수를 추정한다', () => {
    expect(estimateKnown([score(0, 18), score(1, 10)])).toBe(1400)
  })

  it('아는 비율이 80% 아래로 떨어지는 첫 구간부터 시작한다', () => {
    expect(suggestStartRank([score(0, 19), score(1, 15), score(2, 17)])).toBe(1001)
    expect(suggestStartRank([score(0, 19), score(1, 17), score(2, 15)])).toBe(2001)
  })

  it('10구간 모두 80% 이상이면 10,001위부터, 기록이 없으면 1위부터', () => {
    expect(suggestStartRank(Array.from({ length: 10 }, (_, band) => score(band, 20)))).toBe(10_001)
    expect(suggestStartRank([])).toBe(1)
  })

  it('다시 볼 때는 다른 벌을 쓴다', () => {
    expect(nextSet(0)).toBe(0)
    expect(nextSet(1)).toBe(1)
    expect(nextSet(2)).toBe(0)
  })

  it('결과를 한 번에 정리한다', () => {
    const now = new Date('2026-11-06T09:00:00.000Z')
    expect(summarize([score(0, 18), score(1, 10)], 1, now)).toEqual({
      takenAt: now.toISOString(),
      set: 1,
      scores: [score(0, 18), score(1, 10)],
      estimate: 1400,
      startRank: 1001,
    })
  })
})
