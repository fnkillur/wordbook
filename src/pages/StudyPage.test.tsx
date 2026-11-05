import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { makeWord } from '../db/repository'
import { saveSettings } from '../settings'
import StudyPage from './StudyPage'

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.includes(name)) as HTMLButtonElement | undefined

const open = async () => {
  router = createMemoryRouter(
    [
      { path: '/study', element: <StudyPage /> },
      { path: '/make/:wordId', element: <p>만들기 화면</p> },
    ],
    { initialEntries: ['/study'] },
  )
  await act(async () => root.render(<RouterProvider router={router} />))
  await wait()
}

const made = (wordId: string, memo: string) =>
  makeWord({ wordId, image: new Blob(['img'], { type: 'image/jpeg' }), memo, cardTypes: ['produce', 'listen'] }, new Date(Date.now() - 60_000))

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  localStorage.clear()
  saveSettings({ person: '하치와레' })
  let urlCount = 0
  globalThis.URL.createObjectURL = vi.fn(() => `blob:${(urlCount += 1)}`)
  globalThis.URL.revokeObjectURL = vi.fn()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('StudyPage', () => {
  it('앞면은 그림과 기억 한 줄만 보여 주고, 누르면 뒷면에 단어와 두 버튼이 나온다', async () => {
    await made('ja-0001', '옆집 개')
    await open()

    expect(container.textContent).toContain('옆집 개')
    expect(container.textContent).not.toContain('犬')
    expect(button('알았어요')).toBeUndefined()

    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    expect(container.textContent).toContain('犬')
    expect(button('몰랐어요')).toBeDefined()
    expect(button('알았어요')).toBeDefined()
  })

  it('답을 누르면 기록하고 다음 카드로 넘어간다', async () => {
    await made('ja-0001', '옆집 개')
    await made('ja-0002', '우리 집 고양이')
    await open()
    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    await act(async () => button('알았어요')!.click())
    await wait()

    expect(await db.reviewLogs.count()).toBe(1)
    expect(container.textContent).toContain('2 /')
  })

  it('알았어요를 빠르게 두 번 눌러도 한 번만 기록한다', async () => {
    await made('ja-0001', '옆집 개')
    await made('ja-0002', '우리 집 고양이')
    await open()
    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    const good = button('알았어요')!
    await act(async () => {
      good.click()
      good.click()
    })
    await wait()

    expect(await db.reviewLogs.count()).toBe(1)
  })

  it('다음 단어로 넘어가면 그 단어의 그림을 보여 준다', async () => {
    await made('ja-0001', '옆집 개')
    await made('ja-0002', '우리 집 고양이')
    await open()
    const firstImage = container.querySelector('.study-image')?.getAttribute('src')
    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    await act(async () => button('알았어요')!.click())
    await wait()

    expect(container.textContent).toContain('우리 집 고양이')
    expect(container.querySelector('.study-image')?.getAttribute('src')).not.toBe(firstImage)
  })

  it('소리 없이 보기면 소리 카드를 빼고, 다 하면 끝났다고 알려 준다', async () => {
    saveSettings({ soundOff: true })
    await made('ja-0001', '옆집 개')
    await open()

    expect(container.textContent).toContain('1 / 1')
    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    await act(async () => button('알았어요')!.click())
    await wait()

    expect(container.textContent).toMatch(/오늘 할 일을 다 했어요|만들기 화면/)
  })
})
