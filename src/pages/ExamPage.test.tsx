import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORDS } from '../data/words'
import { db } from '../db/database'
import { examResults, saveExamResult, saveVocabTest } from '../db/repository'
import { pickQuestions } from '../domain/exam'
import { newStudyCard } from '../domain/schedule'
import { saveSettings } from '../settings'
import ExamPage from './ExamPage'

const LEARNED = WORDS.ja.slice(0, 100)

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.includes(name)) as HTMLButtonElement | undefined

const open = async () => {
  router = createMemoryRouter(
    [
      { path: '/', element: <p>집</p> },
      { path: '/exam', element: <ExamPage /> },
    ],
    { initialEntries: ['/exam'] },
  )
  await act(async () => root.render(<RouterProvider router={router} />))
  await wait()
}

// 입력칸은 React가 값을 보도록 네이티브 setter로 넣는다.
const type = async (text: string) => {
  const input = container.querySelector('input') as HTMLInputElement
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const startExam = async () => {
  await act(async () => button('시작하기')!.click())
  await wait()
}

const answerAll = async (answers: string[]) => {
  for (const answer of answers) {
    await type(answer)
    await act(async () => button('확인')!.click())
    await act(async () => (button('다음') ?? button('결과 보기'))!.click())
  }
  // 결과는 저장을 마친 뒤 뜬다. 테스트를 한꺼번에 돌리면 느려서 정해진 시간 대신 결과 화면을 기다린다.
  for (let attempt = 0; attempt < 50 && container.querySelector('.exam-input'); attempt += 1) await wait()
  await wait()
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  localStorage.clear()
  saveSettings({ person: '하치와레' })
  await saveVocabTest('ja', { takenAt: '2026-01-01T00:00:00.000Z', set: 0, scores: [], estimate: 990, startRank: 1 })
  await db.cards.bulkPut(
    LEARNED.map(word => {
      const card = newStudyCard(word.id, 'produce', new Date('2026-06-01T00:00:00.000Z'))
      return { ...card, fsrs: { ...card.fsrs, scheduled_days: 30, due: '2026-12-31T00:00:00.000Z' } }
    }),
  )
  vi.spyOn(Math, 'random').mockReturnValue(0)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const questions = () => pickQuestions(LEARNED, 10, () => 0)

describe('제초 검정', () => {
  it('시작 화면에는 다음 시험과 합격 기준만 짧게 보이고, 문제 화면 입력칸에서 쓰는 법을 알려 준다', async () => {
    await open()
    expect(container.querySelector('.exam-next')?.textContent).toContain('4급 시험')
    expect(container.querySelector('.exam-next')?.textContent).toContain('10문제 중 8개 맞히면 합격')
    expect(container.querySelector('.exam-how')).toBeNull()
    expect(container.querySelector('.exam-ladder .is-target')?.textContent).toContain('4급')

    await startExam()
    expect(container.querySelector('.exam-prompt')?.textContent).toContain(questions()[0].meaningKo)
    expect(container.querySelector('input')?.getAttribute('placeholder')).toBe('한자나 히라가나로 써 줘')
    expect(button('확인')?.disabled).toBe(true)
  })

  it('답을 쓰면 맞았는지와 정답을 알려 준다', async () => {
    await open()
    await startExam()
    const [first] = questions()

    await type(first.reading)
    await act(async () => button('확인')!.click())
    expect(container.querySelector('.exam-feedback')?.textContent).toContain('맞았어')
    expect(container.querySelector('.exam-feedback')?.textContent).toContain(first.text)
  })

  it('8개 이상 맞히면 합격을 기록하고 내 급수 자격증을 보여 준다', async () => {
    await open()
    await startExam()
    const answers = questions().map((word, index) => (index < 8 ? word.text : 'ちがう'))

    await answerAll(answers)

    expect(container.textContent).toContain('제초 4급 합격!')
    expect(container.querySelector('.exam-license')?.getAttribute('src')).toContain('license-hachiware-4')
    expect(await examResults('ja')).toMatchObject([{ grade: 4, correct: 8, total: 10, passed: true }])
  })

  it('떨어지면 기록하고, 틀린 단어를 보여 주며 내일 복습으로 당긴다', async () => {
    await open()
    await startExam()
    const wrong = questions()[0]

    await answerAll(questions().map(() => 'ちがう'))

    expect(container.textContent).toContain('괜찮아, 내일 다시 보자')
    expect(container.querySelector('.exam-missed')?.textContent).toContain(wrong.text)
    expect(await examResults('ja')).toMatchObject([{ grade: 4, correct: 0, passed: false }])
    const due = (await db.cards.get(`${wrong.id}:produce`))?.fsrs.due
    expect(new Date(due!).getTime()).toBeLessThan(new Date('2026-12-31T00:00:00.000Z').getTime())
  })

  it('시작하기를 누르면 준비하는 동안 다시 누를 수 없다', async () => {
    await open()
    act(() => button('시작하기')!.click())
    expect(button('시작하기')?.disabled).toBe(true)
    await wait()
    expect(container.querySelector('.vocab-progress-count')?.textContent).toBe('1 / 10')
  })

  it('마지막 결과를 저장하지 못하면 답을 그대로 두고 다시 저장할 수 있다', async () => {
    await open()
    await startExam()
    const answers = questions().map(word => word.text)
    for (const answer of answers.slice(0, -1)) {
      await type(answer)
      await act(async () => button('확인')!.click())
      await act(async () => button('다음')!.click())
    }
    await type(answers.at(-1)!)
    await act(async () => button('확인')!.click())
    const put = vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('저장 실패'))

    await act(async () => button('결과 보기')!.click())
    await wait()
    expect(container.querySelector('.exam-error')?.textContent).toContain('저장하지 못했어')
    expect((container.querySelector('input') as HTMLInputElement).value).toBe(answers.at(-1))
    expect(container.querySelector('.exam-feedback')).not.toBeNull()

    put.mockRestore()
    await act(async () => button('결과 보기')!.click())
    await wait()
    expect(container.textContent).toContain('제초 4급 합격!')
    expect(await examResults('ja')).toHaveLength(1)
  })

  it('글자를 조합하는 중에 누른 Enter(사파리는 keyCode 229)로는 확인하지 않는다', async () => {
    await open()
    await startExam()
    await type(questions()[0].text)
    const press = (init: KeyboardEventInit) => act(async () => container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', ...init })))

    await press({ keyCode: 229 })
    expect(container.querySelector('.exam-feedback')).toBeNull()
    await press({ keyCode: 13 })
    expect(container.querySelector('.exam-feedback')).not.toBeNull()
  })

  it('오늘 떨어진 채로 자정이 지나 앱으로 돌아오면 시험을 다시 볼 수 있다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T21:00:00'))
    await saveExamResult('ja', { takenAt: new Date().toISOString(), grade: 4, correct: 0, total: 10, passed: false })
    await open()
    expect(container.querySelector('.exam-next')?.textContent).toContain('내일 다시 볼 수 있어')

    vi.setSystemTime(new Date('2026-11-11T07:00:00'))
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await wait()
    expect(button('시작하기')).toBeDefined()
  })

  it('시험 중에 나가면 기록하지 않는다', async () => {
    await open()
    await startExam()
    await type(questions()[0].text)
    await act(async () => button('확인')!.click())

    await act(async () => (container.querySelector('[aria-label="그만하기"]') as HTMLElement).click())
    await wait()

    expect(router.state.location.pathname).toBe('/')
    expect(await examResults('ja')).toEqual([])
  })

  it('볼 수 있는 시험이 없으면 남은 것을 알려 준다', async () => {
    await db.cards.clear()
    await open()

    expect(container.querySelector('.exam-next')?.textContent).toContain('5급 시험')
    expect(container.querySelector('.exam-next')?.textContent).toContain('지금 급수 없음')
    expect(container.querySelector('.exam-next')?.textContent).toContain('익힌 단어0 / 30')
    expect(container.querySelector('.exam-next')?.textContent).toContain('둘 다 채우면 시험을 볼 수 있어')
    expect(container.querySelector('.exam-next small')).toBeNull()
    expect(container.querySelectorAll('.exam-ladder li')).toHaveLength(5)
    expect(button('시작하기')).toBeUndefined()
  })
})
