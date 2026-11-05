import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { makeWord } from '../db/repository'
import { saveSettings } from '../settings'
import { fetchTts } from '../sync/tts'
import VillagePage from './VillagePage'

vi.mock('../sync/tts', () => ({ fetchTts: vi.fn() }))

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const continueButton = () => [...container.querySelectorAll('button')].find(item => item.textContent?.includes('이어서 하기')) as HTMLButtonElement

const open = async () => {
  router = createMemoryRouter(
    [
      { path: '/', element: <VillagePage /> },
      { path: '/study', element: <p>복습</p> },
      { path: '/make/:wordId', element: <p>만들기</p> },
    ],
    { initialEntries: ['/'] },
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

describe('VillagePage', () => {
  it('오늘 할 양을 보여 주고, 복습이 없으면 이어서 하기가 첫 단어 만들기로 간다', async () => {
    await open()

    expect(container.textContent).toContain('복습 0장')
    expect(container.textContent).toContain('새 단어 10개')
    await act(async () => continueButton().click())
    await wait()
    expect(router.state.location.pathname).toBe('/make/ja-0001')
  })

  it('마을을 열면 발음을 못 받은 단어의 발음을 다시 받는다', async () => {
    saveSettings({ server: { endpoint: 'https://script.google.com/macros/s/x/exec', token: 'test-token-1234567890' } })
    vi.mocked(fetchTts).mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }))
    await makeWord({ wordId: 'ja-0001', image: null, memo: '', cardTypes: ['listen'] }, new Date())
    await open()
    await wait()

    expect((await db.notes.get('ja-0001'))?.audioSource).toBe('tts')
    expect(vi.mocked(fetchTts).mock.calls[0].slice(1)).toEqual(['いぬ', 'ja'])
  })

  it('복습할 카드가 있으면 복습부터 한다', async () => {
    await makeWord({ wordId: 'ja-0001', image: null, memo: '', cardTypes: ['produce'] }, new Date(Date.now() - 60_000))
    await open()
    await act(async () => continueButton().click())
    await wait()

    expect(router.state.location.pathname).toBe('/study')
  })
})
