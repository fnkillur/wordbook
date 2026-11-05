import { SpeakerHighIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { findWord } from '../data/words'
import { db, type Note } from '../db/database'
import { dayPlan, getMedia, madeCountOn, recordReview, silentWordIds, todaysWords } from '../db/repository'
import { todayQueue, type Grade, type StudyCard } from '../domain/schedule'
import { newWordsLeft } from '../domain/session'
import { getSettings } from '../settings'

type WordMedia = { note: Note; image: Blob | null; audio: Blob | null }
type Loaded = { queue: StudyCard[]; words: Map<string, WordMedia> }

const loadQueue = async (): Promise<Loaded> => {
  const queue = todayQueue(await db.cards.toArray(), new Date(), { soundOff: getSettings().soundOff, silentWords: await silentWordIds() })
  const notes = (await db.notes.bulkGet([...new Set(queue.map(card => card.wordId))])).filter((note): note is Note => !!note)
  const words = await Promise.all(notes.map(async note => ({ note, image: await getMedia(note.wordId, 'image'), audio: await getMedia(note.wordId, 'audio') })))
  return { queue, words: new Map(words.map(word => [word.note.wordId, word])) }
}

const playAudio = (media: WordMedia | undefined) => {
  if (!media?.audio || getSettings().soundOff) return
  try {
    const audio = new Audio(URL.createObjectURL(media.audio))
    audio.play()?.catch(() => {})
  } catch {
    // 소리를 낼 수 없는 환경이면 조용히 넘어간다.
  }
}

// 오늘 기한이 된 카드를 한 장씩: 앞면을 보고 떠올린 뒤 눌러서 뒷면을 열고, 몰랐어요/알았어요로 답한다.
function StudyPage() {
  const navigate = useNavigate()

  // 저장이 끝나기 전에 한 번 더 눌러도 같은 카드를 두 번 채점하지 않게 막는다.
  const isAnswering = useRef(false)

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [index, setIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)

  const card = loaded?.queue[index]
  const media = card ? loaded?.words.get(card.wordId) : undefined
  const isDone = loaded !== null && !card

  useEffect(() => {
    loadQueue().then(setLoaded)
  }, [])

  // 복습을 다 했으면 오늘 만들 단어가 남았는지 보고 이어서 만들기로 간다.
  useEffect(() => {
    if (!isDone) return
    const now = new Date()
    const goMake = async () => {
      const plan = await dayPlan(now, getSettings().goalMinutes)
      if (newWordsLeft(plan, await madeCountOn(now)) === 0) return
      const language = loaded?.queue[0]?.wordId.startsWith('en-') ? 'en' : getSettings().person === '우사기' ? 'en' : 'ja'
      const [next] = await todaysWords(language, 1)
      if (next) navigate(`/make/${next.id}`, { replace: true })
    }
    goMake()
  }, [isDone, loaded, navigate])

  const flip = () => {
    if (isFlipped) return
    setIsFlipped(true)
    playAudio(media)
  }

  const answer = async (grade: Grade) => {
    if (!card || isAnswering.current) return
    isAnswering.current = true
    await recordReview(card.id, grade, new Date())
    setIsFlipped(false)
    setIndex(previous => previous + 1)
    isAnswering.current = false
  }

  if (!loaded) return null

  if (isDone) {
    return (
      <div className="page">
        <main className="page-content study-done">
          <p>오늘 할 일을 다 했어요</p>
          <Link to="/" replace className="button button-primary">
            마을로 돌아가기
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="page study-page">
      <main className="page-content">
        <div className="study-top">
          <Link to="/" replace className="text-button">
            그만하기
          </Link>
          <span>
            {index + 1} / {loaded.queue.length}
          </span>
        </div>
        <button type="button" className="study-card" onClick={flip} aria-label={isFlipped ? '답' : '눌러서 답 보기'}>
          <CardFace key={card!.id} card={card!} media={media} isFlipped={isFlipped} />
        </button>
      </main>
      {isFlipped && (
        <div className="bottom-cta study-answers">
          <button type="button" className="button button-again" onClick={() => answer('again')}>
            몰랐어요
          </button>
          <button type="button" className="button button-good" onClick={() => answer('good')}>
            알았어요
          </button>
        </div>
      )}
    </div>
  )
}

function CardFace({ card, media, isFlipped }: { card: StudyCard; media: WordMedia | undefined; isFlipped: boolean }) {
  const word = findWord(card.wordId)
  const [imageUrl] = useState(() => (media?.image ? URL.createObjectURL(media.image) : null))

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
  }, [imageUrl])

  if (!word) return null

  const image = imageUrl && <img className="study-image" src={imageUrl} alt="" />
  const text = (
    <span className="study-word">
      <strong>{word.text}</strong>
      <small>{word.reading}</small>
    </span>
  )
  const memo = media?.note.memo && <span className="study-memo">{media.note.memo}</span>
  const sound = (
    <span className="study-sound" onClick={event => (event.stopPropagation(), playAudio(media))}>
      <SpeakerHighIcon size={28} aria-hidden="true" />
    </span>
  )

  if (isFlipped) {
    return (
      <>
        {image}
        {text}
        {memo}
      </>
    )
  }
  if (card.type === 'produce') {
    return (
      <>
        {image}
        {memo}
        <span className="study-prompt">말해 보세요</span>
      </>
    )
  }
  if (card.type === 'recognize') {
    return (
      <>
        {text}
        {sound}
        <span className="study-prompt">무엇일까요?</span>
      </>
    )
  }
  if (card.type === 'listen') {
    return (
      <>
        {sound}
        <span className="study-prompt">듣고 떠올려 보세요</span>
      </>
    )
  }
  return (
    <>
      {image}
      {sound}
      <span className="study-prompt">철자를 써 보세요</span>
    </>
  )
}

export default StudyPage
