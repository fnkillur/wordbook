import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MEMO_PROMPTS } from '../characters/lines'
import { db } from '../db/database'
import { saveSettings } from '../settings'
import { fetchTts } from '../sync/tts'
import MakePage from './MakePage'

vi.mock('../sync/tts', () => ({ fetchTts: vi.fn() }))
vi.mock('../media/image', async importOriginal => ({
  ...(await importOriginal<typeof import('../media/image')>()),
  compressImage: vi.fn(async (blob: Blob) => blob),
  cropImage: vi.fn(async (blob: Blob) => blob),
}))

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
// 저장은 여러 단계를 거쳐서, 바쁠 때는 30ms 안에 끝나지 않을 수 있다.
const waitUntil = async (isDone: () => boolean) => {
  for (let attempt = 0; attempt < 50 && !isDone(); attempt += 1) await wait()
}
const waitForPath = (pathname: string) => waitUntil(() => router.state.location.pathname === pathname)

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

// 책장의 책에서 단어를 눌러 들어온 경우
const openFromBook = async (wordId: string) => {
  router = createMemoryRouter(
    [
      { path: '/make/:wordId', element: <MakePage /> },
      { path: '/words/:bookId', element: <p>책 화면</p> },
      { path: '/study', element: <p>복습 화면</p> },
    ],
    { initialEntries: ['/words/grade5', { pathname: `/make/${wordId}`, state: { fromBook: true } }], initialIndex: 1 },
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
    await waitForPath('/make/ja-0002')

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
    await waitUntil(() => container.textContent?.includes('발음은 나중에 받을게') ?? false)

    expect(await db.cards.where('wordId').equals('ja-0001').count()).toBe(3)
    expect(container.textContent).toContain('발음은 나중에 받을게')
  })

  it('이미 만든 단어를 단어장에서 열어 고치면 저장하고 단어장으로 돌아간다', async () => {
    await open('/make/ja-0001')
    await pickImage()
    await act(async () => button('만들기').click())
    await waitForPath('/make/ja-0002')

    await open('/make/ja-0001', '/words')
    await pickImage()
    await act(async () => button('저장').click())
    await waitForPath('/words')

    expect(router.state.location.pathname).toBe('/words')
    expect(vi.mocked(fetchTts)).toHaveBeenCalledTimes(1)
  })

  it('단어장에서 이미 만든 단어를 열면 저장한 그림과 기억을 불러오고, 그대로 저장해도 지우지 않는다', async () => {
    await open('/make/ja-0001')
    await pickImage()
    await act(async () => {
      const input = container.querySelector('.make-memo') as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '옆집 개')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('만들기').click())
    await waitForPath('/make/ja-0002')

    await open('/make/ja-0001', '/words')
    await waitUntil(() => (container.querySelector('.make-memo') as HTMLInputElement | null)?.value === '옆집 개')
    expect(container.querySelector('.make-image img')).not.toBeNull()
    expect((container.querySelector('.make-memo') as HTMLInputElement).value).toBe('옆집 개')

    await act(async () => button('저장').click())
    await waitForPath('/words')
    expect(await db.media.get('ja-0001:image')).toBeDefined()
    expect((await db.notes.get('ja-0001'))?.memo).toBe('옆집 개')
    expect(router.state.location.pathname).toBe('/words')
  })

  it('우사기도 같은 하치와레가 할 일을 알려 준다', async () => {
    saveSettings({ person: '우사기' })
    await open('/make/en-0001')

    expect(container.querySelector('img.character')?.getAttribute('src')).toContain('hachiware-ask')
  })

  it('책에서 들어오면 그만하기 대신 뒤로가기가 있고, 누르면 책으로 돌아간다', async () => {
    await openFromBook('ja-0001')
    expect(container.querySelector('[aria-label="그만하기"]')).toBeNull()

    await act(async () => (container.querySelector('[aria-label="뒤로"]') as HTMLButtonElement).click())
    await waitForPath('/words/grade5')
    expect(router.state.location.pathname).toBe('/words/grade5')
  })

  it('책에서 들어와 새로 만들면 다음 단어 대신 책으로 돌아간다', async () => {
    await openFromBook('ja-0001')
    await pickImage()
    await act(async () => button('만들기').click())
    await waitForPath('/words/grade5')

    expect(router.state.location.pathname).toBe('/words/grade5')
    expect(await db.cards.where('wordId').equals('ja-0001').count()).toBe(3)
  })

  it('헤더 가운데에 화면 이름이 있고, 이미 만든 카드를 열면 고치기라고 한다', async () => {
    await open('/make/ja-0001')
    expect(container.querySelector('.screen-header h1')?.textContent).toBe('카드 만들기')

    await pickImage()
    await act(async () => button('만들기').click())
    await waitForPath('/make/ja-0002')
    await open('/make/ja-0001', '/words')
    await waitUntil(() => container.querySelector('.screen-header h1')?.textContent === '카드 고치기')
    expect(container.querySelector('.screen-header h1')?.textContent).toBe('카드 고치기')
  })

  it('이미 아는 단어야를 누르면 아는 단어로 넘기고 다음 단어로 간다', async () => {
    await open('/make/ja-0001')
    await act(async () => button('이미 아는 단어야').click())
    await waitForPath('/make/ja-0002')

    expect((await db.wordStates.get('ja-0001'))?.status).toBe('known')
    expect(router.state.location.pathname).toBe('/make/ja-0002')
  })

  it('그림을 고르려면 뜻을 알아야 하니 뜻을 처음부터 보여 준다', async () => {
    await open('/make/ja-0001')
    expect(container.querySelector('.study-word strong')?.textContent).toBe('いぬ')
    expect(container.querySelector('.study-word small')?.textContent).toBe('犬')
    expect(container.querySelector('.word-meaning')?.textContent).toBe('개')
    expect(container.querySelector('button.reveal-button')).toBeNull()
  })

  it('기억 한 줄 칸은 떠올릴 거리를 묻는 말로 쓰기를 권한다', async () => {
    await open('/make/ja-0001')
    const placeholder = (container.querySelector('.make-memo') as HTMLInputElement).placeholder

    expect(MEMO_PROMPTS).toContain(placeholder)
    await open('/make/ja-0001')
    expect((container.querySelector('.make-memo') as HTMLInputElement).placeholder).toBe(placeholder)
  })

  it('이미 아는 단어로 넘긴 직후에는 되돌릴 수 있다', async () => {
    await open('/make/ja-0001')
    await act(async () => button('이미 아는 단어야').click())
    await waitForPath('/make/ja-0002')

    expect(container.textContent).toContain('아는 단어로 넘겼어')
    await act(async () => button('되돌리기').click())
    await waitForPath('/make/ja-0001')

    expect(await db.wordStates.get('ja-0001')).toBeUndefined()
    expect(router.state.location.pathname).toBe('/make/ja-0001')
    expect(container.textContent).not.toContain('아는 단어로 넘겼어')
  })

  it('캐릭터가 할 일을 말풍선으로 알려 준다', async () => {
    await open('/make/ja-0001')
    expect(container.querySelector('img.character')?.getAttribute('alt')).toBe('하치와레')
    expect(container.querySelector('img.character')?.getAttribute('src')).toContain('hachiware-ask')
    expect(container.querySelector('.speech-bubble')?.textContent).toContain('어울리는 그림을 찾아 줄래?')

    await pickImage()
    expect(container.querySelector('.speech-bubble')?.textContent).toContain('기억할 한 줄도 적어 볼래?')
  })

  it('나중에 할게를 누르면 건너뛴 단어로 두고 다음 단어로 간다', async () => {
    await open('/make/ja-0001')
    await act(async () => button('나중에 할게').click())
    await waitForPath('/make/ja-0002')

    expect((await db.wordStates.get('ja-0001'))?.status).toBe('skipped')
    expect(router.state.location.pathname).toBe('/make/ja-0002')
  })

  it('그만하기는 위쪽 ✕ 하나이고, 넘기는 버튼은 만들기 아래에 있다', async () => {
    await open('/make/ja-0001')

    expect(container.querySelector('a[aria-label="그만하기"]')).not.toBeNull()
    expect(container.querySelector('.make-top')).toBeNull()
    expect(container.querySelector('.bottom-cta')?.textContent).toContain('이미 아는 단어야')
    expect(container.querySelector('.bottom-cta')?.textContent).toContain('나중에 할게')
  })

  it('만들 카드를 책 페이지로 보여 주고, 빈 그림 칸을 누르면 갤러리가, 카드 아래 버튼으로 구글 찾기가 열린다', async () => {
    await open('/make/ja-0001')

    const card = container.querySelector('.make-card')
    expect(card?.classList).toContain('study-card')
    expect(card?.querySelector('.make-word')).not.toBeNull()
    expect(card?.querySelector('.make-memo')).not.toBeNull()
    expect(container.querySelector('.make-image label input[type="file"]')).not.toBeNull()
    const sources = [...(card?.querySelectorAll('.make-sources .card-action') ?? [])].map(item => item.textContent)
    expect(sources.slice(0, 2)).toEqual(['구글에서 찾기', '갤러리'])
    const order = [...(card?.children ?? [])].map(item => item.className)
    expect(order.indexOf('card-actions make-sources')).toBeLessThan(order.findIndex(name => name.startsWith('make-image')))
    expect(card?.querySelector('.make-memo-line svg')).not.toBeNull()

    await pickImage()
    expect(container.querySelector('.make-image img')).not.toBeNull()
    expect(container.querySelector('.make-image-hint')?.textContent).toContain('끌어서')
  })

  it('그림을 고른 뒤 바꾸는 버튼은 처음 고를 때와 같은 모양이다', async () => {
    await open('/make/ja-0001')
    await pickImage()

    const sources = [...container.querySelectorAll('.make-sources .card-action')].map(item => item.textContent)
    expect(sources).toContain('구글에서 찾기')
    expect(sources).toContain('갤러리')
  })

  it('그림을 고르면 캐릭터가 다음 할 일을 눈에 띄게 다시 말한다', async () => {
    await open('/make/ja-0001')
    const before = container.querySelector('.speech-bubble')
    expect(container.querySelector('.study-host')?.classList.contains('is-talking')).toBe(false)
    await pickImage()

    expect(container.querySelector('.speech-bubble')).not.toBe(before)
    expect(container.querySelector('.study-host')?.classList.contains('is-talking')).toBe(true)
    expect(container.querySelector('.make-memo-line')?.classList.contains('is-suggested')).toBe(true)
  })
})
