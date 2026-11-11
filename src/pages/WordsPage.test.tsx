import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { saveSettings } from '../settings'
import WordsPage from './WordsPage'

vi.mock('../data/words', () => {
  const entry = (id: string, text: string, source: 'base' | 'freq', rank: number | null) => ({ id, order: rank ?? 0, theme: 'Animal', text, reading: '', kanji: null, meaningKo: '뜻', hint: '', searchQuery: text, source, rank })
  const ja = [entry('ja-0001', '犬', 'base', null), entry('ja-0002', '猫', 'base', null), entry('ja-0003', '魚', 'base', null), entry('ja-f00050', '決める', 'freq', 50)]
  return { WORDS: { ja, en: [] }, findWord: (id: string) => ja.find(word => word.id === id) ?? null }
})

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const book = (title: string) => [...container.querySelectorAll('.book')].find(item => item.textContent?.includes(title)) as HTMLButtonElement

const open = async () => {
  router = createMemoryRouter(
    [
      { path: '/words', element: <WordsPage /> },
      { path: '/words/:bookId', element: <p>책 화면</p> },
    ],
    { initialEntries: ['/words'] },
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

describe('WordsPage (책장)', () => {
  it('책장에 제초 검정 5급부터 1급까지 꽂혀 있고, 뗀 단어 수를 보여 준다', async () => {
    await db.wordStates.put({ wordId: 'ja-0001', status: 'made', updatedAt: '2026-11-06T00:00:00.000Z' })
    await db.wordStates.put({ wordId: 'ja-0002', status: 'known', updatedAt: '2026-11-06T00:00:00.000Z' })
    await open()

    expect([...container.querySelectorAll('.book-title')].map(item => item.getAttribute('aria-label'))).toEqual(['제초 검정 5급', '제초 검정 4급', '제초 검정 3급', '제초 검정 2급', '제초 검정 1급'])
    expect(book('5급').textContent).toContain('2 / 3')
    expect(book('4급').textContent).toContain('0 / 1')
  })

  it('단어가 아직 없는 책은 준비 중이라 열 수 없다', async () => {
    await open()
    expect(book('3급').disabled).toBe(true)
    expect(book('3급').textContent).toContain('준비 중')
  })

  it('책을 고르면 그 책을 편다', async () => {
    await open()
    await act(async () => book('5급').click())
    await wait()

    expect(router.state.location.pathname).toBe('/words/grade5')
  })
})
