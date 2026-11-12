import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TEST_WORDS } from '../data/vocabTest'
import { db } from '../db/database'
import { saveVocabTest, startRankOf, vocabTests } from '../db/repository'
import { saveSettings } from '../settings'
import { waitUntil } from '../testing/waitUntil'
import VocabTestPage from './VocabTestPage'

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.includes(name)) as HTMLButtonElement | undefined
const press = (name: string) => act(async () => button(name)!.click())

const open = async () => {
  router = createMemoryRouter(
    [
      { path: '/test', element: <VocabTestPage /> },
      { path: '/', element: <p>홈 화면</p> },
    ],
    { initialEntries: ['/test'] },
  )
  await act(async () => root.render(<RouterProvider router={router} />))
  await wait()
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  localStorage.clear()
  saveSettings({ person: '하치와레' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('VocabTestPage', () => {
  it('처음 보는 테스트는 첫 화면이라 그만하기 없이 시작만 있다', async () => {
    await open()
    expect(container.querySelector('a[href="/"]')).toBeNull()
    expect(button('시작')).toBeDefined()
    expect(container.querySelector('.page-title')?.textContent).toBe('학습을 시작하기 전 테스트!')
    expect(container.querySelector('.vocab-intro img')?.getAttribute('src')).toContain('test-intro')
  })

  it('테스트를 본 적이 있으면 제목 줄 오른쪽 ✕로 그만둘 수 있다', async () => {
    await saveVocabTest('ja', { takenAt: '2026-11-06T00:00:00.000Z', set: 0, scores: [], estimate: 0, startRank: 1 })
    await open()

    const close = container.querySelector('.vocab-intro-header a[aria-label="그만하기"]')
    expect(close).not.toBeNull()
    expect([...container.querySelectorAll('.bottom-cta a')]).toHaveLength(0)
  })

  it('단어를 보면 바로 알고 있어/모르겠어로 답하고, 헷갈리면 뜻을 볼 수 있다', async () => {
    const first = TEST_WORDS.ja.filter(word => word.band === 0 && word.set === 0)[0]
    await open()
    await press('시작')

    expect(container.textContent).toContain(first.text)
    // 회화 위주라 일본어는 히라가나 읽기를 크게, 한자는 뜻 보기 전에도 작게 함께 보여 준다.
    expect(container.querySelector('.word-display')?.textContent).toBe(first.reading)
    expect(container.textContent).toContain('1단계')
    expect(container.textContent).toContain('많이 쓰는 순서로 1~1,000번째 단어')
    expect(container.textContent).toContain('1 / 20')
    expect(container.querySelector('a[aria-label="그만하기"]')).not.toBeNull()
    expect(container.textContent).not.toContain(first.meaningKo)
    expect(button('알고 있어')).toBeDefined()
    expect(button('모르겠어')).toBeDefined()

    await press('뜻 보기')
    expect(container.textContent).toContain(first.meaningKo)
    expect(button('알고 있어')).toBeDefined()
  })

  it('구간의 처음 10개를 다 알면 다음 단계로 넘어간다', async () => {
    await open()
    await press('시작')
    for (let count = 0; count < 10; count += 1) await press('알고 있어')

    expect(container.textContent).toContain('2단계')
    expect(container.textContent).toContain('1 / 20')
  })

  it('두 구간 연속으로 거의 모르면 끝내고, 결과의 시작 위치를 저장한다', async () => {
    await open()
    await press('시작')
    for (let count = 0; count < 40; count += 1) {
      await press('모르겠어')
    }
    await waitUntil(() => (container.textContent ?? '').includes('약 0개'))

    expect(container.textContent).toContain('약 0개')
    expect(container.querySelector('.result-scene')?.textContent).toContain('여기부터는 아직 어려워')
    expect(container.querySelector('.result-scene img')?.getAttribute('src')).toMatch(/defeat|backstep/)
    expect(container.querySelector('.vocab-result-eyebrow')?.textContent).toBe('내 단어 수준')
    expect(container.querySelector('.vocab-bands .is-target')?.textContent).toContain('1단계')
    expect(container.querySelector('.vocab-note')).toBeNull()
    expect(container.querySelector('.vocab-level')?.textContent).toBe('어휘가 500개 더 늘면 5급 수준이야.')
    expect(await vocabTests('ja')).toHaveLength(1)
    expect(await startRankOf('ja')).toBe(1)
    expect(await startRankOf('en')).toBeNull()
    await press('처음부터 시작할게')
    await waitUntil(() => (container.textContent ?? '').includes('홈 화면'))

    expect(container.textContent).toContain('홈 화면')
  })
})
