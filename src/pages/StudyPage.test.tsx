import 'fake-indexeddb/auto'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { sentencesOf } from '../data/sentences'
import { audioReports, dateKey, earnedTotal, makeWord, setSentenceAudio } from '../db/repository'
import { newStudyCard } from '../domain/schedule'
import { saveSettings } from '../settings'
import { waitUntil } from '../testing/waitUntil'
import StudyPage from './StudyPage'

let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const afterReaction = () => act(() => new Promise(resolve => setTimeout(resolve, 760)))
const flip = () => act(async () => (container.querySelector('.study-card') as HTMLElement).click())
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
  await waitUntil(() => (container.textContent ?? '') !== '')
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
    expect(button('알았어')).toBeUndefined()

    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    expect(container.textContent).toContain('犬')
    expect(button('몰랐어')).toBeDefined()
    expect(button('알았어')).toBeDefined()
    expect(button('몰랐어')!.querySelector('img')?.getAttribute('src')).toContain('usagi-wiggle-still')
    expect(button('알았어')!.querySelector('img')?.getAttribute('src')).toContain('usagi-rap-still')
  })

  it('문제를 내면 바로 아래에 답 보기 버튼이 있고, 누르면 그 자리에 몰랐어·알았어가 나온다', async () => {
    await made('ja-0001', '옆집 개')
    await open()

    expect(container.querySelector('.study-answers')?.textContent).toContain('답 보기')
    await act(async () => button('답 보기')!.click())

    expect(container.textContent).toContain('犬')
    expect(button('답 보기')).toBeUndefined()
    expect(button('몰랐어')).toBeDefined()
    expect(button('알았어')).toBeDefined()
  })

  it('답을 열면 답이 화면 아래 버튼에 가리지 않게 필요한 만큼만 스크롤한다', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    await made('ja-0001', '옆집 개')
    await open()
    expect(scrollIntoView).not.toHaveBeenCalled()

    await act(async () => button('답 보기')!.click())
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }))
  })

  it('답을 누르면 기록하고 다음 카드로 넘어간다', async () => {
    await made('ja-0001', '옆집 개')
    await made('ja-0002', '우리 집 고양이')
    await open()
    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    await act(async () => button('알았어')!.click())
    await afterReaction()
    await waitUntil(() => (container.textContent ?? '').includes('2 /'))

    expect(await db.reviewLogs.count()).toBe(1)
    expect(container.textContent).toContain('2 /')
  })

  it('알았어를 빠르게 두 번 눌러도 한 번만 기록한다', async () => {
    await made('ja-0001', '옆집 개')
    await made('ja-0002', '우리 집 고양이')
    await open()
    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    const good = button('알았어')!
    await act(async () => {
      good.click()
      good.click()
    })
    await wait()

    expect(await db.reviewLogs.count()).toBe(1)
  })

  it('개발 모드(StrictMode)에서 효과를 두 번 돌려도 보여 주는 그림 주소를 지우지 않는다', async () => {
    await made('ja-0001', '옆집 개')
    router = createMemoryRouter([{ path: '/study', element: <StudyPage /> }], { initialEntries: ['/study'] })
    await act(async () => root.render(<StrictMode><RouterProvider router={router} /></StrictMode>))
    await wait()

    const shown = container.querySelector('.study-image')?.getAttribute('src')
    expect(shown).toBeTruthy()
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.map(([url]) => url)).not.toContain(shown)
  })

  it('다음 단어로 넘어가면 그 단어의 그림을 보여 준다', async () => {
    await made('ja-0001', '옆집 개')
    await made('ja-0002', '우리 집 고양이')
    await open()
    const firstImage = container.querySelector('.study-image')?.getAttribute('src')
    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    await act(async () => button('알았어')!.click())
    await afterReaction()
    await waitUntil(() => (container.textContent ?? '').includes('우리 집 고양이'))

    expect(container.textContent).toContain('우리 집 고양이')
    expect(container.querySelector('.study-image')?.getAttribute('src')).not.toBe(firstImage)
  })

  it('소리 없이 보기면 소리 카드를 빼고, 다 하면 끝났다고 알려 준다', async () => {
    saveSettings({ soundOff: true })
    await made('ja-0001', '옆집 개')
    await open()

    expect(container.textContent).toContain('1 / 1')
    await act(async () => (container.querySelector('.study-card') as HTMLElement).click())
    await act(async () => button('알았어')!.click())
    await afterReaction()
    await wait()

    expect(container.textContent).toMatch(/오늘 할 일을 다 했어!|만들기 화면/)
  })
  it('오늘 할 양을 다 하면 보너스를 받았다고 알려 준다', async () => {
    saveSettings({ soundOff: true })
    await made('ja-0001', '옆집 개')
    await db.settings.put({ key: `plan:${dateKey(new Date())}:ja`, value: { date: dateKey(new Date()), newWords: 1 } })
    await open()
    await flip()
    await act(async () => button('알았어')!.click())
    await afterReaction()
    await waitUntil(() => (container.textContent ?? '').includes('보너스 10'))

    expect(container.textContent).toContain('오늘 할 일을 다 했어!')
    expect(container.textContent).toContain('보너스 10')
    expect(await earnedTotal()).toBe(16)
    expect(container.querySelector('.effect-overlay')?.textContent).toContain('오늘 목표 달성!')
  })

  it('몰랐어가 많았던 날은 끝에 다독이는 장면을 보여 주고, 닫으면 끝 화면이 나온다', async () => {
    saveSettings({ soundOff: true })
    for (const number of [1, 2, 3]) await made(`ja-000${number}`, `기억 ${number}`)
    await db.settings.put({ key: `plan:${dateKey(new Date())}:ja`, value: { date: dateKey(new Date()), newWords: 0 } })
    await open()
    for (let count = 0; count < 3; count += 1) {
      await waitUntil(() => !!container.querySelector('.study-card') && !button('몰랐어'))
      await flip()
      await act(async () => button('몰랐어')!.click())
      await afterReaction()
    }
    await wait()

    expect(container.querySelector('.effect-overlay')?.textContent).toContain('괜찮아, 내일 또 하자')
    expect(container.querySelector('.effect-overlay img')?.getAttribute('src')).toMatch(/keep-trying|panting/)
    await act(async () => (container.querySelector('.effect-overlay') as HTMLElement).click())
    await wait()
    expect(container.textContent).toContain('오늘 할 일을 다 했어!')
  })

  it('캐릭터가 카드 종류에 맞는 질문을 말풍선으로 낸다', async () => {
    await made('ja-0001', '옆집 개')
    await open()

    expect(container.querySelector('.speech-bubble')?.textContent).toContain('이건 일본어로 뭐라고 할까?')
    expect(container.querySelector('.study-scene img')?.getAttribute('src')).toContain('hachiware-quiz')
    expect(container.querySelector('.study-scene .speech-bubble')?.textContent).toContain('이건 일본어로 뭐라고 할까?')
    expect(container.querySelector('.study-top a')?.getAttribute('aria-label')).toBe('그만하기')
  })

  it('알았어를 누르면 정답 반응을 보이고 잠시 뒤 다음 카드로 넘어간다', async () => {
    await made('ja-0001', '옆집 개')
    await made('ja-0002', '우리 집 고양이')
    await open()
    await flip()
    await act(async () => button('알았어')!.click())
    await waitUntil(() => (container.querySelector('.speech-bubble')?.textContent ?? '').includes('정답!'))

    expect(container.querySelector('.speech-bubble')?.textContent).toContain('정답!')
    expect(container.textContent).toContain('1 /')
    expect(button('알았어')!.classList).toContain('is-chosen')
    expect(button('알았어')!.querySelector('img')?.getAttribute('src')).not.toContain('still')
    expect(button('몰랐어')!.querySelector('img')?.getAttribute('src')).toContain('still')
    await afterReaction()
    await waitUntil(() => (container.textContent ?? '').includes('2 /'))
    expect(container.querySelector('.speech-bubble')?.textContent).toContain('뭐라고 할까?')
    expect(container.textContent).toContain('2 /')
  })

  it('몰랐어를 누르면 다독인다', async () => {
    await made('ja-0001', '옆집 개')
    await made('ja-0002', '우리 집 고양이')
    await open()
    await flip()
    await act(async () => button('몰랐어')!.click())
    await waitUntil(() => (container.querySelector('.speech-bubble')?.textContent ?? '').includes('괜찮아'))

    expect(container.querySelector('.speech-bubble')?.textContent).toContain('괜찮아')
  })

  it('반응을 보이는 동안 다시 눌러도 한 번만 기록한다', async () => {
    await made('ja-0001', '옆집 개')
    await made('ja-0002', '우리 집 고양이')
    await open()
    await flip()
    await act(async () => button('알았어')!.click())
    await wait()
    await act(async () => button('알았어')?.click())
    await afterReaction()

    expect(await db.reviewLogs.count()).toBe(1)
  })

  it('데이터에 없는 단어의 카드는 건너뛴다', async () => {
    await db.cards.put(newStudyCard('ja-f99999', 'produce', new Date(Date.now() - 60_000)))
    await made('ja-0001', '옆집 개')
    await open()

    expect(container.textContent).toContain('1 / 1')
  })

  it('10장째를 답하면 화면 가운데에 효과가 나오고, 누르면 닫힌다', async () => {
    for (let number = 1; number <= 10; number += 1) await made(`ja-${String(number).padStart(4, '0')}`, `기억 ${number}`)
    await open()
    for (let count = 1; count < 10; count += 1) {
      await flip()
      await act(async () => button('알았어')!.click())
      await wait()
      expect(container.querySelector('.effect-overlay')).toBeNull()
      await afterReaction()
    }
    await flip()
    await act(async () => button('알았어')!.click())
    await wait()

    expect(container.querySelector('.effect-overlay img, .effect-overlay video')).not.toBeNull()
    expect(container.querySelector('.guest')).toBeNull()
    await act(async () => (container.querySelector('.effect-overlay') as HTMLElement).click())
    expect(container.querySelector('.effect-overlay')).toBeNull()
  }, 20_000)

  it('폰 앱의 단어 카드도 작은 하치와레를 말풍선 오른쪽에 두어 빈칸 카드와 같은 자리를 쓴다', async () => {
    await made('ja-0001', '옆집 개')
    await open()

    const scene = container.querySelector('.study-scene')
    expect(scene?.classList).toContain('is-compact')
    expect(scene?.classList).toContain('is-avatar-right')
    expect(scene?.querySelector('img')?.getAttribute('src')).toContain('hachiware-quiz-face')
  })

  it('그림 카드의 듣기 버튼은 앞면에서 흐리고(답이 나와서) 답을 보면 쓸 수 있다', async () => {
    await made('ja-0001', '옆집 개')
    await open()

    expect(container.querySelector('.card-actions .card-listen')?.getAttribute('aria-disabled')).toBe('true')
    await flip()
    expect(container.querySelector('.card-listen')?.getAttribute('aria-disabled')).toBe('false')
  })

  it('글자 카드는 소리도 문제의 일부라 앞면에서 바로 들을 수 있다', async () => {
    await makeWord({ wordId: 'ja-0001', image: null, memo: '', cardTypes: ['recognize'] }, new Date(Date.now() - 60_000))
    await open()

    expect(container.querySelector('.card-listen')?.getAttribute('aria-disabled')).toBe('false')
  })

  describe('빈칸 문장 카드', () => {
    const played: string[] = []
    const clozeCard = async (wordId: string) => {
      await makeWord({ wordId, image: new Blob(['img'], { type: 'image/jpeg' }), memo: '', cardTypes: [] }, new Date(Date.now() - 60_000))
      await db.cards.put(newStudyCard(wordId, 'cloze', new Date(Date.now() - 60_000)))
    }
    const translationToggle = () => [...container.querySelectorAll('[role="button"]')].find(item => item.textContent?.includes('번역 보기')) as HTMLElement | undefined

    beforeEach(() => {
      played.length = 0
      vi.stubGlobal(
        'Audio',
        class {
          src: string
          constructor(src: string) {
            this.src = src
          }
          play() {
            played.push(this.src)
            return Promise.resolve()
          }
        },
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('앞면은 빈칸 문장과 그림만 보여 주고 답·번역·소리 버튼은 숨긴다', async () => {
      await clozeCard('ja-f00122')
      await open()

      const sentence = container.querySelector('.cloze-sentence')?.textContent ?? ''
      expect(sentence).toContain('母が')
      expect(sentence).toContain('しています。')
      expect(sentence).not.toContain('心配')
      expect(container.querySelectorAll('.cloze-blank')).toHaveLength(1)
      // 빈 span의 aria-label은 역할이 없으면 화면 읽기가 건너뛴다.
      expect(container.querySelector('.cloze-blank')?.getAttribute('role')).toBe('img')
      expect(container.querySelector('.cloze-blank')?.getAttribute('aria-label')).toBe('빈칸')
      expect(container.querySelector('.study-image')).not.toBeNull()
      expect(container.textContent).not.toContain('엄마가 걱정하고 있어요.')
      expect(container.querySelector('.card-listen')?.getAttribute('aria-disabled')).toBe('true')
      expect(container.querySelector('.speech-bubble')?.textContent).toContain('빈칸에 들어갈 말은?')
    })

    it('앞면의 듣기 버튼은 눌러도 소리를 내지 않고, 답을 본 뒤에는 다시 들을 수 있다', async () => {
      await clozeCard('ja-f00122')
      await setSentenceAudio('ja-f00122', new Blob(['m4a'], { type: 'audio/mp4' }))
      await open()

      await act(async () => (container.querySelector('.card-listen') as HTMLElement).click())
      expect(played).toHaveLength(0)
      expect(button('답 보기')).toBeDefined()

      await flip()
      expect(container.querySelector('.card-listen')?.getAttribute('aria-disabled')).toBe('false')
      await act(async () => (container.querySelector('.card-listen') as HTMLElement).click())
      expect(played).toHaveLength(2)
    })

    it('폰 앱에서는 장면 그림 대신 공부하는 치이카와를 말풍선 옆에 작게 둔다', async () => {
      await clozeCard('ja-f00122')
      await open()

      expect(container.querySelector('.study-scene')?.classList).toContain('is-compact')
      expect(container.querySelector('.study-scene')?.classList).not.toContain('is-avatar-right')
      expect(container.querySelector('.study-scene img')?.getAttribute('src')).toContain('chiikawa-study')
    })

    it('복습한 횟수만큼 다음 활용형 문장을 보여 주고, 사전형과 꼴 힌트는 눌러야 보인다', async () => {
      await clozeCard('ja-0481')
      const card = (await db.cards.get('ja-0481:cloze'))!
      await db.cards.put({ ...card, fsrs: { ...card.fsrs, reps: 1 } })
      const sentences = sentencesOf('ja-0481')
      const expected = sentences[1 % sentences.length]
      await open()

      // 힌트(사전형과 꼴)는 처음엔 가려 두고, 막힐 때 눌러서 본다. 눌러도 카드는 뒤집히지 않는다.
      expect(container.querySelector('.cloze-form')).toBeNull()
      expect(container.querySelector('.cloze-sentence')?.textContent).not.toContain(expected.answer)
      await act(async () => (container.querySelector('.cloze-hint') as HTMLElement).click())
      expect(container.querySelector('.cloze-form')?.textContent).toBe(`行く → ${expected.form}`)
      expect(button('답 보기')).toBeDefined()
    })

    it('답을 보면 활용형 힌트도 함께 보여 준다', async () => {
      await clozeCard('ja-0481')
      await open()
      await flip()

      expect(container.querySelector('.cloze-form')?.textContent).toBe(`行く → ${sentencesOf('ja-0481')[0].form}`)
      expect(container.querySelector('.cloze-answer')?.textContent).toBe(sentencesOf('ja-0481')[0].answer)
    })

    it('활용형 문장의 원어민 녹음은 앱에 든 파일에서 받아 답을 볼 때 재생한다', async () => {
      const [wordId, index] = (() => {
        for (const id of ['ja-0481', 'ja-0504', 'ja-0486', 'ja-0485']) {
          const found = sentencesOf(id).findIndex((sentence, position) => position > 0 && sentence.audioPath)
          if (found > 0) return [id, found] as const
        }
        throw new Error('녹음 있는 활용형 문장이 없어요')
      })()
      vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mp4' } })))
      await clozeCard(wordId)
      const card = (await db.cards.get(`${wordId}:cloze`))!
      await db.cards.put({ ...card, fsrs: { ...card.fsrs, reps: index } })
      await open()
      await flip()

      expect(fetch).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}${sentencesOf(wordId)[index].audioPath}`)
      expect(played).toHaveLength(1)
    })

    it('첫 문장의 음성이 아직 없으면 카드를 열 때 앱에 든 녹음을 받아 둔다', async () => {
      const wordId = ['ja-0481', 'ja-0504', 'ja-0486', 'ja-0485'].find(id => sentencesOf(id)[0]?.audioPath)!
      vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mp4' } })))
      await clozeCard(wordId)
      await open()
      await flip()

      expect(fetch).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}${sentencesOf(wordId)[0].audioPath}`)
      expect(played).toHaveLength(1)
    })

    it('예전 문장으로 받아 둔 음성이 남아 있어도, 문장이 바뀌었으면 지금 문장의 녹음을 다시 받는다', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mp4' } })))
      await clozeCard('ja-0504')
      const card = (await db.cards.get('ja-0504:cloze'))!
      await db.cards.put({ ...card, fsrs: { ...card.fsrs, reps: 1 } })
      await db.media.put({ key: 'ja-0504:sentence-1', data: new ArrayBuffer(1), type: 'audio/mp4' })
      await open()

      expect(fetch).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}${sentencesOf('ja-0504')[1].audioPath}`)
    })

    it('답을 본 뒤 원어민 녹음이 이상하면 제보할 수 있고, 제보하면 알려 준다', async () => {
      await clozeCard('ja-f00001')
      await setSentenceAudio('ja-f00001', new Blob(['m4a'], { type: 'audio/mp4' }))
      await open()
      expect(container.querySelector('.audio-report')).toBeNull()
      await flip()

      await act(async () => (container.querySelector('.audio-report') as HTMLElement).click())
      await waitUntil(() => (container.textContent ?? '').includes('제보했어'))
      expect((await audioReports()).map(report => report.wordId)).toEqual(['ja-f00001'])
      expect(button('답 보기')).toBeUndefined()
    })

    it('번역 보기를 누르면 번역만 보이고 카드는 뒤집히지 않는다', async () => {
      await clozeCard('ja-f00122')
      await open()

      await act(async () => translationToggle()!.click())
      expect(container.textContent).toContain('엄마가 걱정하고 있어요.')
      expect(button('답 보기')).toBeDefined()
    })

    it('답을 보면 빈칸 말과 문장 속 읽기를 보여 주고 문장 음성을 한 번 재생한다', async () => {
      await clozeCard('ja-f00122')
      await setSentenceAudio('ja-f00122', new Blob(['m4a'], { type: 'audio/mp4' }))
      await open()
      await flip()

      expect(container.querySelector('.cloze-answer')?.textContent).toBe('心配')
      expect(container.querySelector('.cloze-reading')?.textContent).toBe('しんぱい')
      expect(played).toHaveLength(1)
    })

    it('가나로 된 빈칸 말은 같은 읽기를 한 번 더 달지 않는다', async () => {
      await clozeCard('ja-f00001')
      await open()
      await flip()

      expect(container.querySelector('.cloze-answer')?.textContent).toBe('します')
      expect(container.querySelector('.cloze-reading')).toBeNull()
    })

    it('소리 없이 보기면 답을 봐도 재생하지 않는다', async () => {
      saveSettings({ soundOff: true })
      await clozeCard('ja-f00122')
      await setSentenceAudio('ja-f00122', new Blob(['m4a'], { type: 'audio/mp4' }))
      await open()
      await flip()

      expect(played).toHaveLength(0)
    })

    it('다음 카드로 넘어가면 번역을 다시 가린다', async () => {
      await clozeCard('ja-f00122')
      await clozeCard('ja-f00001')
      await open()
      await act(async () => translationToggle()!.click())
      await flip()
      await act(async () => button('알았어')!.click())
      await afterReaction()

      expect(container.querySelector('.cloze-translation')).toBeNull()
      expect(translationToggle()).toBeDefined()
    })
  })
})
