import { EyeIcon, SpeakerHighIcon, TranslateIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { EFFECT_MESSAGE, questionOf, reactionOf } from '../characters/lines'
import { pickCelebration, pickImage, TOUGH_DAY_EFFECTS, type Celebration } from '../characters/effects'
import { ANSWER_IMAGES, QUIZ_AVATARS, QUIZ_SCENE } from '../characters/slots'
import EffectOverlay from '../components/EffectOverlay'
import StudyImage from '../components/StudyImage'
import { wordFormsOf } from '../components/wordForms'
import { wordSizeStyle } from '../components/wordSize'
import { findSentence } from '../data/sentences'
import { findWord } from '../data/words'
import { db, type Note } from '../db/database'
import { claimGoalBonus, dayPlan, earnedTotal, getMedia, knownCards, madeCountOn, ownedItemIds, recordReview, silentWordIds, todaysWords } from '../db/repository'
import { todayQueue, type CardType, type Grade, type StudyCard } from '../domain/schedule'
import { isToughDay, newWordsLeft } from '../domain/session'
import { goalEffects, shopItemsFor, unlockedEffects, unlockedItems } from '../domain/shop'
import { COIN } from '../domain/wallet'
import { DEVICE_PERSON, IS_WEB_BUILD } from '../platform'
import { getSettings, learningLanguage } from '../settings'
import { prepareSentenceAudio } from '../sync/sentenceAudio'

type WordMedia = { note: Note; image: Blob | null; audio: Blob | null; sentenceAudio: Blob | null }
type Loaded = { queue: StudyCard[]; words: Map<string, WordMedia> }
type Reaction = { grade: Grade; text: string }

const REACTION_MS = 700
// 화면 작업 중에는 .env.android.local의 VITE_CELEBRATE_EVERY로 효과가 더 자주 나오게 할 수 있다.
const CELEBRATE_EVERY = Number(import.meta.env.VITE_CELEBRATE_EVERY) || 10

const openedItems = async () => unlockedItems(shopItemsFor(getSettings().person ?? DEVICE_PERSON), await earnedTotal(), new Set(await ownedItemIds()))

// 기본 움짤에 도감에서 열린 물건의 효과 영상을 더해 하나를 고른다.
const celebrationNow = async () => pickCelebration(unlockedEffects(await openedItems()))

// 오늘 목표를 채우면 하루 한 번이라 긴 영상(기타·빛나는 버섯)을 끝까지 보여 준다. 아직 안 열렸으면 다른 효과로.
const goalCelebrationNow = async () => {
  const opened = await openedItems()
  const long = goalEffects(opened)
  if (long.length === 0) return pickCelebration(unlockedEffects(opened))
  return { kind: 'video' as const, src: long[Math.floor(Math.random() * long.length)] }
}

const loadQueue = async (): Promise<Loaded> => {
  const queue = todayQueue(await knownCards(learningLanguage()), new Date(), { soundOff: getSettings().soundOff, silentWords: await silentWordIds() })
  const notes = (await db.notes.bulkGet([...new Set(queue.map(card => card.wordId))])).filter((note): note is Note => !!note)
  const words = await Promise.all(notes.map(async note => ({ note, image: await getMedia(note.wordId, 'image'), audio: await getMedia(note.wordId, 'audio'), sentenceAudio: await getMedia(note.wordId, 'sentence') })))
  return { queue, words: new Map(words.map(word => [word.note.wordId, word])) }
}

// 가나로 된 빈칸 말에는 같은 읽기를 또 달 필요가 없다.
const hasKanji = (text: string) => /\p{Script=Han}/u.test(text)

// 세로가 짧은 폰 앱에서는 카드 그림 자리를 넓히려고 장면 대신 작은 얼굴을 말풍선 옆에 둔다. 웹앱(아이폰)은 자리가 넉넉하다.
const sceneOf = (card: StudyCard) => {
  if (IS_WEB_BUILD) return { className: 'study-scene', image: QUIZ_SCENE, alt: '하치와레가 문제를 내' }
  if (card.type === 'cloze') return { className: 'study-scene is-compact', image: QUIZ_AVATARS.cloze, alt: '치이카와가 공부하고 있어' }
  return { className: 'study-scene is-compact is-avatar-right', image: QUIZ_AVATARS.word, alt: '하치와레가 문제를 내' }
}

// 그림만 보고 단어를 떠올리는 카드는 소리를 들으면 답이 나와서, 앞면에서는 듣기를 막는다.
const canListenBeforeAnswer = (type: CardType) => type !== 'produce' && type !== 'cloze'

const playAudio = (sound: Blob | null | undefined) => {
  if (!sound || getSettings().soundOff) return
  try {
    const audio = new Audio(URL.createObjectURL(sound))
    audio.play()?.catch(() => {})
  } catch {
    // 소리를 낼 수 없는 환경이면 조용히 넘어간다.
  }
}

// 오늘 기한이 된 카드를 한 장씩: 앞면을 보고 떠올린 뒤 눌러서 뒷면을 열고, 몰랐어/알았어로 답한다.
function StudyPage() {
  const navigate = useNavigate()

  // 저장이 끝나기 전에 한 번 더 눌러도 같은 카드를 두 번 채점하지 않게 막는다.
  const isAnswering = useRef(false)
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef<HTMLButtonElement>(null)
  // 오늘 이 화면에서 답한 것. 끝에 다독일지 정한다.
  const grades = useRef<Grade[]>([])

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [index, setIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const [hasBonus, setHasBonus] = useState(false)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [cheer, setCheer] = useState<Celebration | null>(null)
  const [goalCelebration, setGoalCelebration] = useState<Celebration | null>(null)
  const [isCheered, setIsCheered] = useState(false)

  const card = loaded?.queue[index]
  const media = card ? loaded?.words.get(card.wordId) : undefined
  const isDone = loaded !== null && !card
  const scene = card ? sceneOf(card) : null

  useEffect(() => {
    loadQueue().then(setLoaded)
    return () => {
      if (reactionTimer.current) clearTimeout(reactionTimer.current)
    }
  }, [])

  // 복습을 다 했으면 오늘 만들 단어가 남았는지 보고 이어서 만들기로 간다. 남은 게 없으면 오늘 할 양을 다 한 것이라 보너스를 준다.
  useEffect(() => {
    if (!isDone) return
    // 몰랐어가 많았던 날은 다독이는 장면을 먼저 보여 주고, 닫으면 이어서 간다.
    if (isToughDay(grades.current) && !isCheered) {
      setCheer(pickImage(TOUGH_DAY_EFFECTS))
      return
    }
    const now = new Date()
    const goMake = async () => {
      const plan = await dayPlan(now, getSettings().goalMinutes, learningLanguage())
      if (newWordsLeft(plan, await madeCountOn(now, learningLanguage())) === 0) {
        if (!(await claimGoalBonus(now))) return
        setHasBonus(true)
        setGoalCelebration(await goalCelebrationNow())
        return
      }
      const [next] = await todaysWords(learningLanguage(), 1)
      if (next) navigate(`/make/${next.id}`, { replace: true })
    }
    goMake()
  }, [isDone, isCheered, loaded, navigate])

  // 폴드 커버처럼 짧은 화면에서는 답을 열면 카드가 아래 버튼에 가려서, 가리지 않을 만큼만 내려 준다. 다음 카드는 맨 위부터.
  useEffect(() => {
    if (!isFlipped) {
      window.scrollTo?.({ top: 0 })
      return
    }
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    cardRef.current?.scrollIntoView?.({ block: 'nearest', behavior })
  }, [isFlipped, index])

  const flip = () => {
    if (isFlipped) return
    setIsFlipped(true)
    playAudio(card?.type === 'cloze' ? media?.sentenceAudio : media?.audio)
  }

  const answer = async (grade: Grade) => {
    if (!card || isAnswering.current) return
    isAnswering.current = true
    const clozeWordId = await recordReview(card.id, grade, new Date())
    if (clozeWordId) prepareSentenceAudio(clozeWordId)
    const word = findWord(card.wordId)!
    const answered = index + 1
    grades.current.push(grade)
    setReaction({ grade, text: reactionOf(grade, word) })
    if (answered % CELEBRATE_EVERY === 0) celebrationNow().then(setCelebration)
    // 반응을 잠깐 보여 준 뒤 다음 카드로. 그동안 다시 눌러도 기록하지 않는다.
    reactionTimer.current = setTimeout(() => {
      setReaction(null)
      setIsFlipped(false)
      setIndex(previous => previous + 1)
      isAnswering.current = false
    }, REACTION_MS)
  }

  const closeCheer = () => {
    setCheer(null)
    setIsCheered(true)
  }

  const overlays = (
    <>
      {celebration && <EffectOverlay celebration={celebration} message={EFFECT_MESSAGE.cards} onClose={() => setCelebration(null)} />}
      {cheer && <EffectOverlay celebration={cheer} message={EFFECT_MESSAGE.tough} onClose={closeCheer} />}
      {goalCelebration && <EffectOverlay celebration={goalCelebration} message={EFFECT_MESSAGE.goal} onClose={() => setGoalCelebration(null)} />}
    </>
  )

  if (!loaded) return null

  if (isDone) {
    return (
      <div className="page">
        <main className="page-content study-done">
          <p>오늘 할 일을 다 했어!</p>
          {hasBonus && <p className="study-bonus">보너스 {COIN.goal}을 받았어.</p>}
          <Link to="/" replace className="button button-primary">
            홈으로 돌아가기
          </Link>
        </main>
        {overlays}
      </div>
    )
  }

  return (
    <div className="page study-page">
      <main className="page-content">
        <div className="study-top">
          <Link to="/" replace className="nav-button" aria-label="그만하기">
            <XIcon size={24} weight="bold" aria-hidden="true" />
          </Link>
          <span>
            {index + 1} / {loaded.queue.length}
          </span>
        </div>
        <section className={scene!.className}>
          <img src={scene!.image} alt={scene!.alt} />
          <p className="speech-bubble" aria-live="polite">
            {reaction ? reaction.text : questionOf(card!.type, card!.wordId.startsWith('en-') ? 'en' : 'ja')}
          </p>
        </section>
        <button ref={cardRef} type="button" className="study-card" onClick={flip} aria-label={isFlipped ? '답' : '눌러서 답 보기'}>
          <CardFace key={card!.id} card={card!} media={media} isFlipped={isFlipped} />
        </button>
      </main>
      {overlays}
      {/* 플루언트 포에버처럼 문제와 함께 답 보기를 바로 두고, 답을 보면 그 자리에서 맞혔는지 고른다. */}
      <div className="bottom-cta study-answers">
        {isFlipped ? (
          <>
            <AnswerButton grade="again" label="몰랐어" chosen={reaction?.grade ?? null} onAnswer={answer} />
            <AnswerButton grade="good" label="알았어" chosen={reaction?.grade ?? null} onAnswer={answer} />
          </>
        ) : (
          <button type="button" className="button" onClick={flip}>
            <EyeIcon size={20} aria-hidden="true" />
            답 보기
          </button>
        )}
      </div>
    </div>
  )
}

function CardFace({ card, media, isFlipped }: { card: StudyCard; media: WordMedia | undefined; isFlipped: boolean }) {
  const word = findWord(card.wordId)

  if (!word) return null
  if (card.type === 'cloze') return <ClozeFace wordId={card.wordId} media={media} isFlipped={isFlipped} />

  const language = card.wordId.startsWith('en-') ? 'en' : 'ja'
  const forms = wordFormsOf(word, language)
  const image = media?.image && (
    <span className="study-image-frame">
      <StudyImage image={media.image} />
    </span>
  )
  const text = (
    <span className="study-word">
      <strong lang={language} className="word-display" style={wordSizeStyle(forms.main)}>
        {forms.main}
      </strong>
      {forms.sub && <small lang={language}>{forms.sub}</small>}
    </span>
  )
  const memo = media?.note.memo && <span className="study-memo">{media.note.memo}</span>
  const actions = (
    <span className="card-actions">
      <ListenButton sound={media?.audio} isEnabled={isFlipped || canListenBeforeAnswer(card.type)} />
    </span>
  )

  if (isFlipped) {
    return (
      <>
        {image}
        {text}
        {memo}
        {actions}
      </>
    )
  }
  if (card.type === 'produce') {
    return (
      <>
        {image}
        {memo}
        {actions}
      </>
    )
  }
  if (card.type === 'recognize') {
    return (
      <>
        {text}
        {actions}
      </>
    )
  }
  if (card.type === 'listen') {
    return (
      <>
        <span className="study-sound" onClick={event => (event.stopPropagation(), playAudio(media?.audio))}>
          <SpeakerHighIcon size={28} aria-hidden="true" />
        </span>
        {actions}
      </>
    )
  }
  return (
    <>
      {image}
      {actions}
    </>
  )
}

// 플루언트 포에버의 빈칸 문장 카드: 번역 대신 그림을 힌트로 두고, 번역은 막힐 때만 눌러서 본다.
// 빈칸 길이는 답 글자 수와 상관없이 같게 해서 길이로 답을 짐작하지 않게 한다.
function ClozeFace({ wordId, media, isFlipped }: { wordId: string; media: WordMedia | undefined; isFlipped: boolean }) {
  const [isTranslationShown, setIsTranslationShown] = useState(false)

  const sentence = findSentence(wordId)
  const language = wordId.startsWith('en-') ? 'en' : 'ja'

  if (!sentence) return null

  const toggleTranslation = (event: MouseEvent) => {
    event.stopPropagation()
    setIsTranslationShown(previous => !previous)
  }

  return (
    <>
      <span lang={language} className="cloze-sentence">
        {sentence.before}
        {isFlipped ? (
          <span className="cloze-filled">
            <strong className="cloze-answer">{sentence.answer}</strong>
            {hasKanji(sentence.answer) && <small className="cloze-reading">{sentence.reading}</small>}
          </span>
        ) : (
          <span className="cloze-blank" role="img" aria-label="빈칸" />
        )}
        {sentence.after}
      </span>
      {isTranslationShown && <span className="cloze-translation">{sentence.translation}</span>}
      {media?.image && (
        <span className="study-image-frame">
          <StudyImage image={media.image} />
        </span>
      )}
      <span className="card-actions">
        <span role="button" tabIndex={0} className="card-action" onClick={toggleTranslation}>
          <TranslateIcon size={20} aria-hidden="true" />
          {isTranslationShown ? '번역 숨기기' : '번역 보기'}
        </span>
        {/* 문장 음성에는 빈칸 말이 그대로 들어 있어서 앞면에서는 버튼만 보여 준다. */}
        <ListenButton sound={media?.sentenceAudio} isEnabled={isFlipped} />
      </span>
    </>
  )
}

// 모든 카드의 듣기 버튼은 카드 아래 같은 자리에 둔다. 쓸 수 없을 때는 흐리게만 보여 줘서 버튼이 움직이지 않는다.
function ListenButton({ sound, isEnabled }: { sound: Blob | null | undefined; isEnabled: boolean }) {
  const listen = (event: MouseEvent) => {
    event.stopPropagation()
    if (isEnabled) playAudio(sound)
  }

  return (
    <span role="button" tabIndex={0} aria-disabled={!isEnabled} className="card-action card-listen" onClick={listen}>
      <SpeakerHighIcon size={20} aria-hidden="true" />
      듣기
    </span>
  )
}

type AnswerButtonProps = { grade: keyof typeof ANSWER_IMAGES; label: string; chosen: Grade | null; onAnswer: (grade: Grade) => void }

function AnswerButton({ grade, label, chosen, onAnswer }: AnswerButtonProps) {
  const isChosen = chosen === grade
  const image = ANSWER_IMAGES[grade]

  return (
    <button type="button" className={`button button-${grade}${isChosen ? ' is-chosen' : ''}`} disabled={chosen !== null} onClick={() => onAnswer(grade)}>
      <img className="answer-image" src={isChosen ? image.moving : image.still} alt="" />
      {label}
    </button>
  )
}

export default StudyPage
