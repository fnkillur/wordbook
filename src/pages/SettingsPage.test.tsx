import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import SettingsPage from './SettingsPage'

let container: HTMLDivElement
let root: Root

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.includes(name)) as HTMLButtonElement | undefined

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<SettingsPage />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('백업 내보내기 (아이폰 웹앱)', () => {
  it('파일을 먼저 만들고, 저장하기를 누르는 순간 공유 시트를 연다', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share })

    await act(async () => button('백업 파일 만들기')!.click())
    await wait()
    expect(share).not.toHaveBeenCalled()

    await act(async () => button('저장하기')!.click())
    expect(share).toHaveBeenCalledTimes(1)
  })

  it('공유 시트를 닫아도 오류로 알리지 않는다', async () => {
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: vi.fn(async () => Promise.reject(new DOMException('취소', 'AbortError'))) })

    await act(async () => button('백업 파일 만들기')!.click())
    await wait()
    await act(async () => button('저장하기')!.click())
    await wait()

    expect(container.textContent).not.toContain('만들지 못했어요')
  })
})
