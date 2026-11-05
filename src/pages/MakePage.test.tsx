import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { saveSettings } from '../settings'
import { fetchTts } from '../sync/tts'
import MakePage from './MakePage'

vi.mock('../sync/tts', () => ({ fetchTts: vi.fn() }))
vi.mock('../media/image', async importOriginal => ({
  ...(await importOriginal<typeof import('../media/image')>()),
  compressImage: vi.fn(async (blob: Blob) => blob),
}))

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))

const open = async (path: string, from?: string) => {
  router = createMemoryRouter(
    [
      { path: '/make/:wordId', element: <MakePage /> },
      { path: '/study', element: <p>복습 화면</p> },
      { path: '/words', element: <p>단어장</p> },
    ],
    { initialEntries: from ? [from, path] : [path], initialIndex: from ? 1 : 0 },
  )
  await act(async () => root.render(<RouterProvider router={router} />))
  await wait()
}

const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.includes(name)) as HTMLButtonElement

const pickImage = async () => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [new File(['img'], 'dog.jpg', { type: 'image/jpeg' })], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  await wait()
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  localStorage.clear()
  saveSettings({ person: '하치와레', server: { endpoint: 'https://script.google.com/macros/s/x/exec', token: 'test-token-1234567890' } })
  vi.mocked(fetchTts).mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }))
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  globalThis.URL.revokeObjectURL = vi.fn()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('MakePage', () => {
  it('단어와 읽기를 보여 주고, 그림이 없으면 만들 수 없다', async () => {
    await open('/make/ja-0001')

    expect(container.textContent).toContain('犬')
    expect(container.textContent).toContain('いぬ')
    expect(button('만들기').disabled).toBe(true)
  })

  it('그림을 넣고 만들면 카드 세 장과 발음을 저장하고 다음 단어로 간다', async () => {
    await open('/make/ja-0001')
    await pickImage()
    await act(async () => button('만들기').click())
    await wait()

    expect(await db.cards.where('wordId').equals('ja-0001').count()).toBe(3)
    expect((await db.notes.get('ja-0001'))?.audioSource).toBe('tts')
    expect(vi.mocked(fetchTts).mock.calls[0].slice(1)).toEqual(['いぬ', 'ja'])
    expect(router.state.location.pathname).toBe('/make/ja-0002')
  })

  it('발음 받기에 실패해도 카드는 저장되고 알려 준다', async () => {
    vi.mocked(fetchTts).mockRejectedValue(new Error('서버 오류'))
    await open('/make/ja-0001')
    await pickImage()
    await act(async () => button('만들기').click())
    await wait()

    expect(await db.cards.where('wordId').equals('ja-0001').count()).toBe(3)
    expect(container.textContent).toContain('발음은 나중에 받아요')
  })

  it('이미 만든 단어를 단어장에서 열어 고치면 저장하고 단어장으로 돌아간다', async () => {
    await open('/make/ja-0001')
    await pickImage()
    await act(async () => button('만들기').click())
    await wait()

    await open('/make/ja-0001', '/words')
    await pickImage()
    await act(async () => button('저장').click())
    await wait()

    expect(router.state.location.pathname).toBe('/words')
    expect(vi.mocked(fetchTts)).toHaveBeenCalledTimes(1)
  })

  it('알아요를 누르면 아는 단어로 넘기고 다음 단어로 간다', async () => {
    await open('/make/ja-0001')
    await act(async () => button('알아요').click())
    await wait()

    expect((await db.wordStates.get('ja-0001'))?.status).toBe('known')
    expect(router.state.location.pathname).toBe('/make/ja-0002')
  })
})
