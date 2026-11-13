import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { newStudyCard } from '../domain/schedule'
import { makeWord, saveExamResult, saveVocabTest, setStartRank } from '../db/repository'
import { saveSettings } from '../settings'
import { backupIfDue } from '../sync/driveBackup'
import { fetchTts } from '../sync/tts'
import VillagePage from './VillagePage'

vi.mock('../sync/tts', () => ({ fetchTts: vi.fn() }))
vi.mock('../sync/driveBackup', () => ({ backupIfDue: vi.fn(async () => false) }))

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const waitUntil = async (isDone: () => boolean) => {
  for (let attempt = 0; attempt < 50 && !isDone(); attempt += 1) await wait()
}
const waitForPath = (pathname: string) => waitUntil(() => router.state.location.pathname === pathname)
const continueButton = () => [...container.querySelectorAll('button')].find(item => item.textContent?.includes('이어서 하기')) as HTMLButtonElement

const open = async () => {
  router = createMemoryRouter(
    [
      { path: '/', element: <VillagePage /> },
      { path: '/study', element: <p>복습</p> },
      { path: '/make/:wordId', element: <p>만들기</p> },
      { path: '/test', element: <p>어휘량 테스트</p> },
      { path: '/exam', element: <p>제초 검정</p> },
    ],
    { initialEntries: ['/'] },
  )
  await act(async () => root.render(<RouterProvider router={router} />))
  await waitUntil(() => router.state.location.pathname !== '/' || container.querySelector('.today-amount') !== null)
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  localStorage.clear()
  saveSettings({ person: '하치와레' })
  await saveVocabTest('ja', { takenAt: '2026-11-06T00:00:00.000Z', set: 0, scores: [], estimate: 0, startRank: 1 })
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
    await waitForPath('/make/ja-0001')
    expect(router.state.location.pathname).toBe('/make/ja-0001')
  })

  it('홈을 열면 발음을 못 받은 단어의 발음을 다시 받는다', async () => {
    saveSettings({ server: { endpoint: 'https://script.google.com/macros/s/x/exec', token: 'test-token-1234567890' } })
    vi.mocked(fetchTts).mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }))
    await makeWord({ wordId: 'ja-0001', image: null, memo: '', cardTypes: ['listen'] }, new Date())
    await open()
    await wait()

    expect((await db.notes.get('ja-0001'))?.audioSource).toBe('tts')
    expect(vi.mocked(fetchTts).mock.calls[0].slice(1)).toEqual(['いぬ', 'ja'])
  })

  it('홈을 열면 하루 한 번 드라이브 백업을 해 본다', async () => {
    await open()
    expect(backupIfDue).toHaveBeenCalled()
  })

  it('시험장 그림을 채운 배너에 시험 보러 가기를 적고, 누르면 시험 안내에 간다', async () => {
    await open()
    const exam = container.querySelector('a.exam-entry') as HTMLAnchorElement
    expect(exam.querySelector('img')?.getAttribute('src')).toContain('exam-gate')
    expect(exam.textContent).toBe('시험 보러 가기')
    await act(async () => exam.click())
    await waitForPath('/exam')
    expect(router.state.location.pathname).toBe('/exam')
  })

  it('딴 자격증이 있으면 오늘 공부하기 카드 오른쪽 위에 가장 높은 급수 자격증을 올려 둔다', async () => {
    await open()
    expect(container.querySelector('.today-card .today-license')).toBeNull()

    await act(async () => {
      await saveExamResult('ja', { takenAt: '2026-11-10T00:00:00.000Z', grade: 5, correct: 9, total: 10, passed: true })
      await saveExamResult('ja', { takenAt: '2026-11-11T00:00:00.000Z', grade: 4, correct: 9, total: 10, passed: true })
    })
    await waitUntil(() => container.querySelector('.today-card .today-license') !== null)

    const license = container.querySelector('.today-card .today-license')
    expect(license?.getAttribute('src')).toContain('license-hachiware-4')
    expect(license?.getAttribute('alt')).toBe('제초 4급 자격증')
  })

  it('복습할 카드가 있으면 복습부터 한다', async () => {
    await makeWord({ wordId: 'ja-0001', image: null, memo: '', cardTypes: ['produce'] }, new Date(Date.now() - 60_000))
    await open()
    await act(async () => continueButton().click())
    await waitForPath('/study')

    expect(router.state.location.pathname).toBe('/study')
  })

  it('어휘량 테스트를 아직 안 봤으면 집 대신 테스트가 첫 화면이다', async () => {
    await db.settings.clear()
    await open()

    expect(router.state.location.pathname).toBe('/test')
  })

  it('개발용으로 테스트 건너뛰기를 켜면 테스트를 안 봤어도 집이 첫 화면이다', async () => {
    vi.stubEnv('VITE_SKIP_VOCAB_TEST', 'true')
    await db.settings.clear()
    await open()

    expect(router.state.location.pathname).toBe('/')
    expect(container.querySelector('.home-scene')).not.toBeNull()
    vi.unstubAllEnvs()
  })

  it('배우는 언어를 바꾸면 그 언어로 테스트를 아직 안 봤을 때 테스트가 첫 화면이다', async () => {
    saveSettings({ language: 'en' })
    await open()

    expect(router.state.location.pathname).toBe('/test')
  })

  it('오늘 할 양은 지금 배우는 언어만 센다', async () => {
    await makeWord({ wordId: 'ja-0001', image: null, memo: '', cardTypes: ['produce'] }, new Date(Date.now() - 60_000))
    await saveVocabTest('en', { takenAt: '2026-11-06T00:00:00.000Z', set: 0, scores: [], estimate: 0, startRank: 1 })
    saveSettings({ language: 'en' })
    await open()

    expect(container.textContent).toContain('복습 0장')
  })

  it('시작 위치부터 준비된 빈도 단어가 없으면 준비 중이라고 알린다', async () => {
    await open()
    expect(container.textContent).not.toContain('새 단어를 준비하고 있어')

    await setStartRank('ja', 5001)
    await wait()
    expect(container.textContent).toContain('새 단어를 준비하고 있어')
  })

  it('단어 데이터에 없는 카드는 복습 수에 넣지 않는다', async () => {
    await db.cards.put(newStudyCard('ja-f99999', 'produce', new Date(Date.now() - 60_000)))
    await open()

    expect(container.textContent).toContain('복습 0장')
  })

  it('시작 위치가 빈도 목록 끝을 넘으면 준비 중 대신 거의 다 안다고 알린다', async () => {
    await setStartRank('ja', 10_001)
    await open()

    expect(container.textContent).not.toContain('새 단어를 준비하고 있어')
    expect(container.textContent).toContain('자주 쓰는 단어는 거의 다 알아')
  })

  it('집에는 하치와레가 공부하는 영상이 소리 없이 반복해서 나온다', async () => {
    await open()
    expect(container.querySelector('.page-title')?.textContent).toBe('치이카와네 집')
    const video = container.querySelector<HTMLVideoElement>('.home-scene video')
    expect(video?.getAttribute('src')).toContain('home-study')
    expect(video?.getAttribute('poster')).toContain('home-study-poster')
    expect(video?.muted).toBe(true)
    expect(video?.loop).toBe(true)
    expect(video?.autoplay).toBe(true)
  })

  it('집 그림에는 말풍선을 올리지 않는다', async () => {
    await open()
    expect(container.querySelector('.home-scene video')).not.toBeNull()
    expect(container.querySelector('.home-scene p')).toBeNull()
  })
})
