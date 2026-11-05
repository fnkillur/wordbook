import { describe, expect, it } from 'vitest'
import { newWordsLeft, nextStep, type DayPlan } from './session'

const plan: DayPlan = { date: '2026-11-05', newWords: 5 }

describe('nextStep', () => {
  it('복습이 남으면 복습, 다 하면 새 단어 만들기, 둘 다 없으면 끝', () => {
    expect(nextStep({ dueCount: 3, newWordsLeft: 2 })).toBe('review')
    expect(nextStep({ dueCount: 0, newWordsLeft: 2 })).toBe('make')
    expect(nextStep({ dueCount: 0, newWordsLeft: 0 })).toBe('done')
  })
})

describe('newWordsLeft', () => {
  it('오늘 정한 수에서 오늘 만든 단어 수를 뺀다(알아요·건너뛰기는 세지 않는다)', () => {
    expect(newWordsLeft(plan, 2)).toBe(3)
    expect(newWordsLeft(plan, 7)).toBe(0)
  })
})
