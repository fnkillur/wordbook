import { Capacitor } from '@capacitor/core'
import { CaretLeftIcon, ClipboardTextIcon, ImageIcon, MagnifyingGlassIcon, PencilSimpleLineIcon, XIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { makePromptOf, memoPromptOf } from '../characters/lines'
import { HOST } from '../characters/slots'
import Character from '../components/Character'
import ImageCropper from '../components/ImageCropper'
import { wordFormsOf } from '../components/wordForms'
import { wordSizeStyle } from '../components/wordSize'
import { findWord, speechTextOf, type WordEntry } from '../data/words'
import { db } from '../db/database'
import { dayPlan, getMedia, madeCountOn, makeWord, markWord, setAudio, todaysWords, unmarkWord } from '../db/repository'
import type { CardType } from '../domain/schedule'
import { newWordsLeft } from '../domain/session'
import type { Placement } from '../media/crop'
import { compressImage, cropImage, onWindowFocus, readClipboardImage, type ClipboardImage } from '../media/image'
import { subscribeSharedImage, takeSharedImage } from '../media/sharedImage'
import { googleImageUrl } from '../media/search'
import type { Language } from '../platform'
import { getSettings } from '../settings'
import { fetchTts } from '../sync/tts'

const AUDIO_LATER = '발음은 나중에 받을게'
const UNDO_SECONDS = 4

// fromBook: 책장의 책에서 단어를 눌러 들어왔다. 이때는 오늘 할 단어로 이어 가지 않고 책으로 돌아간다.
type MakeState = { notice?: string; knownWordId?: string; fromBook?: boolean } | null

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

  if (!word) return <p className="page-content">단어를 찾지 못했어.</p>
  return <MakeForm key={word.id} word={word} />
}

function MakeForm({ word }: { word: WordEntry }) {
  const navigate = useNavigate()
  const location = useLocation()

  const existing = useLiveQuery(async () => (await db.notes.get(word.id)) ?? null, [word.id])

  const [picked, setPicked] = useState<{ blob: Blob; url: string; isSaved?: boolean } | null>(null)
  const [memo, setMemo] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [clipOffer, setClipOffer] = useState<ClipboardImage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUndoShown, setIsUndoShown] = useState(true)
  const cropRef = useRef<{ placement: Placement | null; isAdjusted: boolean }>({ placement: null, isAdjusted: false })

  const language = languageOf(word)
  const forms = wordFormsOf(word, language)
  const { notice, knownWordId, fromBook } = (location.state as MakeState) ?? {}

  const applyImage = async (blob: Blob) => {
    try {
      const compressed = await compressImage(blob)
      setPicked({ blob: compressed, url: URL.createObjectURL(compressed) })
      setError(null)
    } catch {
      setError('이 그림은 못 넣었어. 다른 그림을 골라 줘.')
    }
    setClipOffer(null)
  }

  useEffect(() => {
    if (!picked) return
    return () => URL.revokeObjectURL(picked.url)
  }, [picked])

  useEffect(() => {
    if (!knownWordId) return
    const timer = setTimeout(() => setIsUndoShown(false), UNDO_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [knownWordId])

  // 단어장에서 고치러 들어오면 저장한 그림과 기억 한 줄을 불러온다.
  useEffect(() => {
    if (!existing) return
    let isCancelled = false
    getMedia(word.id, 'image').then(blob => {
      if (isCancelled) return
      setMemo(current => current || existing.memo)
      if (blob) setPicked(current => current ?? { blob, url: URL.createObjectURL(blob), isSaved: true })
    })
    return () => {
      isCancelled = true
    }
  }, [existing, word.id])

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

  const goNext = async (nextState?: MakeState) => {
    const now = new Date()
    const plan = await dayPlan(now, getSettings().goalMinutes, language)
    const [next] = newWordsLeft(plan, await madeCountOn(now, language)) > 0 ? await todaysWords(language, 1) : []
    navigate(next ? `/make/${next.id}` : '/study', { replace: true, state: nextState })
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
    const { placement, isAdjusted } = cropRef.current
    // 저장해 둔 그림을 건드리지 않았으면 다시 자르지 않고 그대로 둔다.
    const image = picked.isSaved && !isAdjusted ? null : placement ? await cropImage(picked.blob, placement) : picked.blob
    await makeWord({ wordId: word.id, image, memo: memo.trim(), cardTypes: cardTypesFor(language) }, new Date())
    const hasAudio = await fetchAudio()
    // 단어장에서 고치러 들어왔거나 책에서 골라 들어온 거면 오늘 만들 단어로 넘어가지 않고 돌아간다.
    if (existing || fromBook) {
      navigate(-1)
      return
    }
    await goNext(hasAudio ? null : { notice: AUDIO_LATER })
  }

  const handleSkip = async (status: 'known' | 'skipped') => {
    await markWord(word.id, status)
    if (fromBook) {
      navigate(-1)
      return
    }
    await goNext(status === 'known' ? { knownWordId: word.id } : null)
  }

  const handleUndoKnown = async () => {
    if (!knownWordId) return
    await unmarkWord(knownWordId)
    navigate(`/make/${knownWordId}`, { replace: true })
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
    setError('복사한 그림이 없어. 그림을 길게 눌러 복사해 줘.')
  }

  return (
    <div className="page make-page">
      <main className="page-content make-content">
        {/* 스크롤해도 할 일을 계속 알려 주게 캐릭터 줄은 위에 붙여 둔다. */}
        <header className="make-header">
          <div className="screen-header">
            {fromBook ? (
              <button type="button" className="nav-button" aria-label="뒤로" onClick={() => navigate(-1)}>
                <CaretLeftIcon size={24} weight="bold" aria-hidden="true" />
              </button>
            ) : (
              <Link to="/" replace className="nav-button" aria-label="그만하기">
                <XIcon size={24} weight="bold" aria-hidden="true" />
              </Link>
            )}
            <h1>{existing ? '카드 고치기' : '카드 만들기'}</h1>
          </div>
          {/* 그림을 고르고 기억 한 줄로 넘어갈 때만 말풍선이 튀어나오듯 다시 그린다. */}
          <div key={picked ? 'memo' : 'image'} className={picked ? 'study-host is-talking' : 'study-host'}>
            <Character name={HOST} pose="ask" />
            <p className="speech-bubble" aria-live="polite">
              {makePromptOf(picked !== null)}
            </p>
          </div>
        </header>
        {notice && <p className="notice">{notice}</p>}

        {/* 만들 카드를 복습 카드와 같은 책 페이지로 미리 보여 준다. */}
        <section className="study-card make-card">
          <div className="make-word">
            <span className="study-word">
              <strong lang={language} className="word-display" style={wordSizeStyle(forms.main)}>
                {forms.main}
              </strong>
              {forms.sub && <small lang={language}>{forms.sub}</small>}
              {word.hint && <small>({word.hint})</small>}
            </span>
            <span className="word-meaning">{word.meaningKo}</span>
          </div>

          {/* 그림을 찾는 게 가장 먼저 할 일이라 단어 바로 아래에 둬서 짧은 화면에서도 가리지 않는다. */}
          <div className="card-actions make-sources">
            <a className={picked ? 'card-action' : 'card-action is-primary'} href={googleImageUrl(word, language)} target="_blank" rel="noreferrer">
              <MagnifyingGlassIcon size={18} weight="bold" aria-hidden="true" />
              구글에서 찾기
            </a>
            <label className="card-action">
              <ImageIcon size={18} aria-hidden="true" />
              갤러리
              <input type="file" accept="image/*" aria-label="갤러리에서 고르기" hidden onChange={handleGallery} />
            </label>
            {!Capacitor.isNativePlatform() && (
              <button type="button" className="card-action" onClick={handlePaste}>
                <ClipboardTextIcon size={18} aria-hidden="true" />
                붙여넣기
              </button>
            )}
          </div>

          {picked ? (
            <div className="make-image has-image">
              <ImageCropper key={picked.url} url={picked.url} onPlacementChange={(placement, isAdjusted) => (cropRef.current = { placement, isAdjusted })} />
            </div>
          ) : (
            <div className="make-image">
              <label className="make-image-pick">
                <ImageIcon size={32} aria-hidden="true" />
                눌러서 갤러리에서 고르기
                <input type="file" accept="image/*" aria-label="갤러리에서 고르기" hidden onChange={handleGallery} />
              </label>
            </div>
          )}
          {picked && <p className="make-image-hint">끌어서 옮기고, 두 손가락으로 크기를 바꿀 수 있어</p>}

          {clipOffer && (
            <div className="make-offer" role="status">
              <span>복사한 그림을 넣을까?</span>
              <button type="button" className="text-button text-primary" onClick={() => applyImage(clipOffer.blob)}>
                넣기
              </button>
            </div>
          )}
          {error && <p className="make-error">{error}</p>}

          {/* 기억 한 줄은 공책 줄에 연필로 적는 느낌으로. */}
          <label className={`make-memo-line${picked && !memo ? ' is-suggested' : ''}`}>
            <PencilSimpleLineIcon size={20} aria-hidden="true" />
            <input className="make-memo" placeholder={memoPromptOf(word.id)} value={memo} onChange={event => setMemo(event.target.value)} />
          </label>

        </section>
      </main>

      <div className="bottom-cta make-cta">
        {knownWordId && isUndoShown && (
          <div className="make-undo" role="status">
            <span>아는 단어로 넘겼어</span>
            <button type="button" className="text-button" onClick={handleUndoKnown}>
              되돌리기
            </button>
          </div>
        )}
        <button type="button" className="button button-primary" disabled={!picked || isSaving} onClick={handleMake}>
          {isSaving ? '저장하는 중' : existing ? '저장' : '만들기'}
        </button>
        {existing === null && (
          <div className="make-skips">
            <button type="button" className="text-button" onClick={() => handleSkip('known')}>
              이미 아는 단어야
            </button>
            <button type="button" className="text-button" onClick={() => handleSkip('skipped')}>
              나중에 할게
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default MakePage
