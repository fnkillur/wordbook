import { Capacitor } from '@capacitor/core'
import { ClipboardTextIcon, ImageIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { findWord, speechTextOf, type WordEntry } from '../data/words'
import { db } from '../db/database'
import { dayPlan, madeCountOn, makeWord, markWord, setAudio, todaysWords } from '../db/repository'
import type { CardType } from '../domain/schedule'
import { newWordsLeft } from '../domain/session'
import { compressImage, onWindowFocus, readClipboardImage, type ClipboardImage } from '../media/image'
import { subscribeSharedImage, takeSharedImage } from '../media/sharedImage'
import { googleImageUrl } from '../media/search'
import type { Language } from '../platform'
import { getSettings } from '../settings'
import { fetchTts } from '../sync/tts'

const AUDIO_LATER = '발음은 나중에 받아요'

// 한 번 물어본 클립보드 내용은 다시 묻지 않는다.
const offeredClips = new Set<string>()

const languageOf = (word: WordEntry): Language => (word.id.startsWith('ja-') ? 'ja' : 'en')

const cardTypesFor = (language: Language): CardType[] => {
  const types: CardType[] = ['produce', 'recognize', 'listen']
  return language === 'en' && getSettings().spellCards ? [...types, 'spell'] : types
}

function MakePage() {
  const { wordId } = useParams()

  const word = wordId ? findWord(wordId) : null

  if (!word) return <p className="page-content">단어를 찾지 못했어요.</p>
  return <MakeForm key={word.id} word={word} />
}

function MakeForm({ word }: { word: WordEntry }) {
  const navigate = useNavigate()
  const location = useLocation()

  const existing = useLiveQuery(async () => (await db.notes.get(word.id)) ?? null, [word.id])

  const [picked, setPicked] = useState<{ blob: Blob; url: string } | null>(null)
  const [memo, setMemo] = useState('')
  const [isMeaningShown, setIsMeaningShown] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [clipOffer, setClipOffer] = useState<ClipboardImage | null>(null)
  const [error, setError] = useState<string | null>(null)

  const language = languageOf(word)
  const notice = (location.state as { notice?: string } | null)?.notice

  const applyImage = async (blob: Blob) => {
    try {
      const compressed = await compressImage(blob)
      setPicked({ blob: compressed, url: URL.createObjectURL(compressed) })
      setError(null)
    } catch {
      setError('이 그림은 넣지 못했어요. 다른 그림을 골라 주세요.')
    }
    setClipOffer(null)
  }

  useEffect(() => {
    if (!picked) return
    return () => URL.revokeObjectURL(picked.url)
  }, [picked])

  // 안드로이드 앱은 구글 이미지에서 복사하고 돌아오면 바로 넣을지 묻는다. 공유로 보낸 그림은 바로 넣는다.
  useEffect(() => {
    const shared = takeSharedImage()
    if (shared) compressImage(shared).then(compressed => setPicked({ blob: compressed, url: URL.createObjectURL(compressed) }))
    const stopShare = subscribeSharedImage(blob => applyImage(blob))
    const stopFocus = onWindowFocus(async () => {
      const clip = await readClipboardImage().catch(() => null)
      if (!clip || offeredClips.has(clip.signature)) return
      offeredClips.add(clip.signature)
      setClipOffer(clip)
    })
    return () => {
      stopShare()
      stopFocus()
    }
  }, [])

  const goNext = async (nextNotice?: string) => {
    const now = new Date()
    const plan = await dayPlan(now, getSettings().goalMinutes)
    const [next] = newWordsLeft(plan, await madeCountOn(now)) > 0 ? await todaysWords(language, 1) : []
    navigate(next ? `/make/${next.id}` : '/study', { replace: true, state: { notice: nextNotice } })
  }

  const fetchAudio = async () => {
    const server = getSettings().server
    if (existing?.audioSource) return true
    if (!server) return false
    try {
      await setAudio(word.id, await fetchTts(server, speechTextOf(word), language), 'tts')
      return true
    } catch {
      return false
    }
  }

  const handleMake = async () => {
    if (!picked || isSaving) return
    setIsSaving(true)
    await makeWord({ wordId: word.id, image: picked.blob, memo: memo.trim(), cardTypes: cardTypesFor(language) }, new Date())
    const hasAudio = await fetchAudio()
    // 단어장에서 고치러 들어온 거면 오늘 만들 단어로 넘어가지 않고 돌아간다.
    if (existing) {
      navigate(-1)
      return
    }
    await goNext(hasAudio ? undefined : AUDIO_LATER)
  }

  const handleSkip = async (status: 'known' | 'skipped') => {
    await markWord(word.id, status)
    await goNext()
  }

  const handleGallery = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) applyImage(file)
  }

  const handlePaste = async () => {
    const clip = await readClipboardImage().catch(() => null)
    if (clip) {
      applyImage(clip.blob)
      return
    }
    setError('복사한 그림이 없어요. 그림을 길게 눌러 복사해 주세요.')
  }

  return (
    <div className="page make-page">
      <main className="page-content make-content">
        {notice && <p className="notice">{notice}</p>}
        <div className="make-top">
          <Link to="/" replace className="text-button">
            그만하기
          </Link>
          <div className="make-actions">
            <button type="button" className="text-button" onClick={() => handleSkip('known')}>
              알아요
            </button>
            <button type="button" className="text-button" onClick={() => handleSkip('skipped')}>
              건너뛰기
            </button>
          </div>
        </div>

        <section className="make-word">
          <strong lang={language}>{word.text}</strong>
          <span className="make-reading">{word.reading}</span>
          {word.hint && <span className="make-hint">({word.hint})</span>}
          <button type="button" className="text-button make-meaning" onClick={() => setIsMeaningShown(!isMeaningShown)}>
            {isMeaningShown ? word.meaningKo : '뜻 보기'}
          </button>
        </section>

        <div className={`make-image${picked ? ' has-image' : ''}`}>{picked ? <img src={picked.url} alt="고른 그림" /> : <span>그림을 골라 주세요</span>}</div>

        {clipOffer && (
          <div className="make-offer" role="status">
            <span>복사한 그림을 넣을까요?</span>
            <button type="button" className="text-button text-primary" onClick={() => applyImage(clipOffer.blob)}>
              넣기
            </button>
          </div>
        )}
        {error && <p className="make-error">{error}</p>}

        <div className="make-sources">
          <a className="source-button" href={googleImageUrl(word, language)} target="_blank" rel="noreferrer">
            <MagnifyingGlassIcon size={18} aria-hidden="true" />
            구글 이미지
          </a>
          <label className="source-button">
            <ImageIcon size={18} aria-hidden="true" />
            갤러리
            <input type="file" accept="image/*" aria-label="갤러리에서 고르기" hidden onChange={handleGallery} />
          </label>
          {!Capacitor.isNativePlatform() && (
            <button type="button" className="source-button" onClick={handlePaste}>
              <ClipboardTextIcon size={18} aria-hidden="true" />
              붙여넣기
            </button>
          )}
        </div>

        <input className="make-memo" placeholder="나만의 기억 한 줄 (선택)" value={memo} onChange={event => setMemo(event.target.value)} />
      </main>

      <div className="bottom-cta">
        <button type="button" className="button button-primary" disabled={!picked || isSaving} onClick={handleMake}>
          {isSaving ? '저장하는 중' : existing ? '저장' : '만들기'}
        </button>
      </div>
    </div>
  )
}

export default MakePage
