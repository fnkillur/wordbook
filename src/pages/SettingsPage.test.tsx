import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { getSettings, saveSettings } from '../settings'
import { backupToDrive, restoreFromDrive } from '../sync/driveBackup'
import SettingsPage from './SettingsPage'

vi.mock('../sync/driveBackup', () => ({
  NO_DRIVE_BACKUP: '드라이브에 아직 백업이 없어.',
  backupToDrive: vi.fn(),
  backupIfDue: vi.fn(async () => false),
  restoreFromDrive: vi.fn(),
  driveBackupState: vi.fn(async () => ({ lastAt: '2026-11-10T12:00:00+09:00', uploaded: {} })),
}))

const SERVER = { endpoint: 'https://script.google.com/macros/s/abc/exec', token: 'test-token-1234567890' }

let container: HTMLDivElement
let root: Root

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const rerender = () => act(async () => root.render(<MemoryRouter><SettingsPage key={Math.random()} /></MemoryRouter>))
const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.includes(name)) as HTMLButtonElement | undefined

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  localStorage.clear()
  saveSettings({ person: '하치와레' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter><SettingsPage /></MemoryRouter>))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
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

describe('배우는 언어', () => {
  it('설정에서 일본어와 영어 중 배울 언어를 고르고, 영어일 때만 철자 카드를 켤 수 있다', async () => {
    const group = container.querySelector('[aria-label="배우는 언어"]')!
    expect(group.querySelector('[aria-checked="true"]')?.textContent).toBe('일본어')
    expect(container.textContent).not.toContain('철자 카드')

    await act(async () => button('영어')!.click())
    expect(getSettings().language).toBe('en')
    expect(container.textContent).toContain('철자 카드')
  })
})

describe('화면 구성', () => {
  it('설정을 공부·서버·백업으로 묶어 제목을 단다', () => {
    expect([...container.querySelectorAll('.form-group-title')].map(title => title.textContent)).toEqual(['공부', '서버', '백업'])
  })

  it('서버를 아직 연결하지 않았으면 연결 안 됨으로 보여 준다', () => {
    expect(container.querySelector('.status-badge')?.textContent).toBe('연결 안 됨')
  })
})

describe('드라이브 백업', () => {
  it('서버를 연결하지 않았으면 드라이브 백업과 되살리기를 누를 수 없다', () => {
    expect(button('드라이브에 백업하기')?.disabled).toBe(true)
    expect(button('드라이브에서 되살리기')?.disabled).toBe(true)
    expect(container.textContent).toContain('서버를 연결하면 쓸 수 있어')
  })

  it('마지막으로 올린 때를 보여 주고, 누르면 진행을 보여 주며 올린다', async () => {
    saveSettings({ server: SERVER })
    let finish = () => {}
    vi.mocked(backupToDrive).mockImplementation(async (_server, _person, _now, onProgress) => {
      onProgress?.(2, 5)
      await new Promise<void>(resolve => {
        finish = resolve
      })
      return 5
    })
    await rerender()
    await wait()
    expect(container.textContent).toContain('마지막 백업 11월 10일')

    await act(async () => button('드라이브에 백업하기')!.click())
    expect(container.textContent).toContain('올리는 중 2/5')
    expect(vi.mocked(backupToDrive).mock.calls[0].slice(0, 2)).toEqual([SERVER, '하치와레'])

    await act(async () => finish())
    await wait()
    expect(container.textContent).toContain('드라이브에 백업했어.')
  })

  it('되살리면 가져온 개수를 알려 주고, 백업이 없으면 그렇게 말한다', async () => {
    saveSettings({ server: SERVER })
    await rerender()
    vi.mocked(restoreFromDrive).mockResolvedValueOnce({ added: 5, updated: 1, skipped: 0 })
    await act(async () => button('드라이브에서 되살리기')!.click())
    await wait()
    expect(container.textContent).toContain('되살렸어: 새로 5개, 바뀐 것 1개')

    vi.mocked(restoreFromDrive).mockRejectedValueOnce(new Error('드라이브에 아직 백업이 없어.'))
    await act(async () => button('드라이브에서 되살리기')!.click())
    await wait()
    expect(container.textContent).toContain('드라이브에 아직 백업이 없어.')
  })
})
