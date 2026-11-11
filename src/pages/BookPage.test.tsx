import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { saveSettings } from '../settings'
import BookPage from './BookPage'

vi.mock('../data/words', () => {
  const entry = (id: string, text: string, source: 'base' | 'freq', rank: number | null, theme = 'Animal') => ({ id, order: rank ?? 0, theme, text, reading: '', kanji: null, meaningKo: '뜻', hint: '', searchQuery: text, source, rank })
  const ja = [entry('ja-0001', '犬', 'base', null), entry('ja-0002', '猫', 'base', null), entry('ja-0003', '魚', 'base', null, 'Food'), entry('ja-f00050', '決める', 'freq', 50), entry('ja-f00020', '残る', 'freq', 20)]
  return { WORDS: { ja, en: [] }, findWord: (id: string) => ja.find(word => word.id === id) ?? null }
})

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.includes(name)) as HTMLButtonElement | undefined
const press = async (name: string) => {
  await act(async () => button(name)!.click())
  await wait()
}
const rowTexts = () => [...container.querySelectorAll('.book-word strong')].map(item => item.textContent)

const open = async (bookId = 'grade5', search = '') => {
  router = createMemoryRouter(
    [
      { path: '/words', element: <p>책장</p> },
      { path: '/words/:bookId', element: <BookPage /> },
      { path: '/make/:wordId', element: <p>만들기 화면</p> },
    ],
    { initialEntries: [`/words/${bookId}${search}`] },
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

describe('BookPage (책)', () => {
  it('5급은 주제별 장으로, 회화 책은 많이 쓰는 순서로 단어를 보여 준다', async () => {
    await open()
    expect([...container.querySelectorAll('.book-chapter h2')].map(item => item.textContent)).toEqual(['1장 동물', '2장 음식'])
    expect(rowTexts()).toEqual(['犬', '猫', '魚'])

    await open('grade4')
    expect(rowTexts()).toEqual(['残る', '決める'])
  })

  it('인덱스 탭으로 만들 단어·만든 단어·아는 단어를 넘겨 본다', async () => {
    await db.wordStates.put({ wordId: 'ja-0002', status: 'made', updatedAt: '2026-11-06T00:00:00.000Z' })
    await open()
    expect(container.querySelector('.index-tab[aria-checked="true"]')?.textContent).toBe('만들 단어')
    expect(rowTexts()).toEqual(['犬', '魚'])

    await press('만든 단어')
    expect(rowTexts()).toEqual(['猫'])
    expect(container.querySelector('.book-stamp')).toBeNull()
  })

  it('만든 단어 중 기억할 한 줄까지 적은 단어에만 표시를 단다', async () => {
    for (const wordId of ['ja-0001', 'ja-0002']) await db.wordStates.put({ wordId, status: 'made', updatedAt: '2026-11-06T00:00:00.000Z' })
    await db.notes.put({ wordId: 'ja-0001', memo: '옆집 개', audioSource: null, madeAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' })
    await db.notes.put({ wordId: 'ja-0002', memo: '', audioSource: null, madeAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' })
    await open('grade5', '?tab=made')

    const marked = [...container.querySelectorAll('.book-word')].map(row => Boolean(row.querySelector('.book-memo-mark')))
    expect(marked).toEqual([true, false])
  })

  it('연필을 들고 단어에 동그라미를 쳐서 한 번에 아는 단어로 넘긴다', async () => {
    await open()
    await press('연필 들기')
    await press('犬')
    await press('魚')
    expect(container.querySelectorAll('.pencil-circle')).toHaveLength(2)
    await press('아는 단어로 (2)')

    expect(rowTexts()).toEqual(['猫'])
    expect((await db.wordStates.get('ja-0001'))?.status).toBe('known')
    await press('아는 단어')
    expect(rowTexts()).toEqual(['犬', '魚'])
  })

  it('연필을 든 동안에는 단어를 눌러도 만들기 화면으로 가지 않는다', async () => {
    await open()
    await press('연필 들기')
    await press('猫')

    expect(container.textContent).not.toContain('만들기 화면')
    expect(button('아는 단어로 (1)')).toBeDefined()
  })

  it('전부는 지금 보이는 단어를 모두 고르고, 지우개는 동그라미만 지운다', async () => {
    await open()
    await press('연필 들기')
    await press('전부')
    expect(button('아는 단어로 (3)')).toBeDefined()

    await press('지우개')
    expect(container.querySelectorAll('.pencil-circle')).toHaveLength(0)
    expect(button('아는 단어로 (0)')).toBeDefined()
  })

  it('내려놓기를 누르면 동그라미를 지우고 연필을 내려놓는다', async () => {
    await open()
    await press('연필 들기')
    await press('犬')
    await press('내려놓기')

    expect(container.querySelectorAll('.pencil-circle')).toHaveLength(0)
    expect(button('연필 들기')).toBeDefined()
    expect(container.querySelector('.pencil-actions')).toBeNull()
  })

  it('탭을 바꾸면 연필을 내려놓고, 만든 단어는 아는 단어로 덮지 않는다', async () => {
    await db.wordStates.put({ wordId: 'ja-0002', status: 'made', updatedAt: '2026-11-06T00:00:00.000Z' })
    await open()
    await press('연필 들기')
    await press('만든 단어')

    expect(button('아는 단어로')).toBeUndefined()
    expect((await db.wordStates.get('ja-0002'))?.status).toBe('made')
  })

  it('단어를 누르면 책에서 왔다는 표시와 함께 만들기 화면으로 간다', async () => {
    await open()
    await act(async () => (container.querySelector('a.book-word') as HTMLAnchorElement).click())
    await wait()

    expect(router.state.location.pathname).toBe('/make/ja-0001')
    expect(router.state.location.state).toEqual({ fromBook: true })
  })

  it('고른 탭은 주소에 남겨서, 다른 화면에 갔다 돌아와도 그 탭이 열려 있다', async () => {
    await db.wordStates.put({ wordId: 'ja-0002', status: 'made', updatedAt: '2026-11-06T00:00:00.000Z' })
    await open('grade5', '?tab=made')
    expect(container.querySelector('.index-tab[aria-checked="true"]')?.textContent).toBe('만든 단어')
    expect(rowTexts()).toEqual(['猫'])

    await press('아는 단어')
    expect(router.state.location.search).toBe('?tab=known')
  })

  it('맨 위 한 줄에 책장으로 돌아가기, 가운데 책 이름, 오른쪽 책 설명이 있다', async () => {
    await open()
    const header = container.querySelector('.book-header')!
    expect(header.querySelector('a[href="/words"]')?.getAttribute('aria-label')).toBe('책장으로')
    expect(header.querySelector('h1')?.textContent).toBe('제초 검정 5급')
    expect(header.querySelector('.book-summary')?.textContent).toBe('기초 그림 단어')
  })
})
