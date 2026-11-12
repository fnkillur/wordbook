import { ClockIcon, EyeIcon, XIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { DEFEAT_EFFECTS, pickImage } from '../characters/effects'
import { TEST_INTRO_IMAGE } from '../characters/slots'
import ResultScene from '../components/ResultScene'
import { wordSizeStyle } from '../components/wordSize'
import { wordFormsOf } from '../components/wordForms'
import { TEST_WORDS } from '../data/vocabTest'
import { examProgress, saveVocabTest, setStartRank, vocabTests } from '../db/repository'
import { vocabLevelText } from '../domain/exam'
import { BAND_COUNT, BAND_SIZE, FREQ_LIMIT, isBandDone, nextSet, shouldStop, spreadOrder, summarize, type BandScore, type VocabTestResult } from '../domain/vocabTest'
import { learningLanguage } from '../settings'

type Progress = { set: 0 | 1; scores: BandScore[]; band: number; index: number; known: number }

const stageLabel = (band: number) => `${band + 1}단계`

const noteOf = (startRank: number) =>
  startRank > FREQ_LIMIT ? '자주 쓰는 10,000단어는 거의 다 알아. 더 어려운 단어는 따로 준비할게.' : '아는 단어가 80%보다 적은 단계부터 시작해.'

const startLabelOf = (startRank: number) => {
  if (startRank > FREQ_LIMIT) return '홈으로'
  if (startRank === 1) return '처음부터 시작할게'
  return `${startRank.toLocaleString()}번째 단어부터 시작할게`
}

const rangeLabel = (band: number) => `많이 쓰는 순서로 ${(band * BAND_SIZE + 1).toLocaleString()}~${((band + 1) * BAND_SIZE).toLocaleString()}번째 단어`

// 빈도 구간마다 표본 20개로 아는 비율을 재서, 아는 단어 수와 학습 시작 위치를 정한다.
function VocabTestPage() {
  const navigate = useNavigate()

  const language = learningLanguage()

  const hasTested = useLiveQuery(async () => (await vocabTests(language)).length > 0, [language])

  // 마지막 단어를 빠르게 두 번 눌러 결과를 두 번 저장하지 않게 막는다.
  const isFinishing = useRef(false)

  const [progress, setProgress] = useState<Progress | null>(null)
  const [isRevealed, setIsRevealed] = useState(false)
  const [result, setResult] = useState<VocabTestResult | null>(null)
  // 어려운 구간에서 끝났을 때 보여 줄 장면. 결과를 정할 때 한 번 골라 둔다.
  const [defeatImage, setDefeatImage] = useState<string | null>(null)
  const [levelText, setLevelText] = useState('')

  const words = progress ? spreadOrder(TEST_WORDS[language].filter(word => word.band === progress.band && word.set === progress.set).sort((first, second) => first.rank - second.rank)) : []
  const word = progress ? words[progress.index] : undefined
  const forms = word ? wordFormsOf(word, language) : null

  const start = async () => {
    const previous = await vocabTests(language)
    setProgress({ set: nextSet(previous.length), scores: [], band: 0, index: 0, known: 0 })
  }

  const answer = async (isKnown: boolean) => {
    if (!progress || isFinishing.current) return
    const known = progress.known + (isKnown ? 1 : 0)
    setIsRevealed(false)
    const answered = progress.index + 1
    if (!isBandDone({ answered, known, total: words.length })) {
      setProgress({ ...progress, index: answered, known })
      return
    }
    const scores = [...progress.scores, { band: progress.band, known, total: answered }]
    if (!shouldStop(scores)) {
      setProgress({ ...progress, scores, band: progress.band + 1, index: 0, known: 0 })
      return
    }
    isFinishing.current = true
    const now = new Date()
    const summary = summarize(scores, progress.set, now)
    // 결과 화면에서 버튼 없이 나가도 테스트한 보람이 남게, 시작 위치도 함께 정해 둔다.
    await saveVocabTest(language, summary)
    await setStartRank(language, summary.startRank)
    if (summary.scores.length < BAND_COUNT) setDefeatImage(pickImage(DEFEAT_EFFECTS).src)
    setLevelText(vocabLevelText(await examProgress(language, now)))
    setResult(summary)
  }

  if (result) {
    const targetBand = (result.startRank - 1) / BAND_SIZE

    return (
      <div className="page">
        <main className="page-content">
          <div className="vocab-column vocab-result">
            <div className="vocab-result-head">
              <span className="vocab-result-eyebrow">내 단어 수준</span>
              <h1 className="page-title">약 {result.estimate.toLocaleString()}개를 알아</h1>
            </div>
            {defeatImage && <ResultScene image={defeatImage} />}
            <section className="vocab-result-card" aria-label="단계별로 아는 단어">
              <ul className="vocab-bands">
                {result.scores.map(score => (
                  <li key={score.band} className={score.band === targetBand ? 'is-target' : undefined}>
                    <span>{stageLabel(score.band)}</span>
                    <span className="vocab-bar" aria-hidden="true">
                      <span style={{ width: `${(score.known / score.total) * 100}%` }} />
                    </span>
                    <span className="vocab-band-count">
                      {score.known}/{score.total}
                    </span>
                  </li>
                ))}
              </ul>
              {/* 중간에 끝나면 말풍선이 이미 시작할 곳을 알려 준다. */}
              {!defeatImage && <p className="vocab-note">{noteOf(result.startRank)}</p>}
            </section>
            <p className="vocab-level">{levelText}</p>
          </div>
        </main>
        <div className="bottom-cta vocab-cta">
          <button type="button" className="button button-primary" onClick={() => navigate('/', { replace: true })}>
            {startLabelOf(result.startRank)}
          </button>
        </div>
      </div>
    )
  }

  if (!progress || !word || !forms) {
    return (
      <div className="page">
        <main className="page-content vocab-intro-page">
          <div className="vocab-column vocab-intro">
            {/* 처음 보는 테스트는 끝내야 집으로 갈 수 있어서 그만두는 ✕를 두지 않는다. */}
            <div className="vocab-intro-header">
              <h1 className="page-title">{hasTested ? '내 단어 수준 다시 알아보기' : '학습을 시작하기 전 테스트!'}</h1>
              {hasTested && (
                <Link to="/" replace className="nav-button" aria-label="그만하기">
                  <XIcon size={24} weight="bold" aria-hidden="true" />
                </Link>
              )}
            </div>
            <span className="vocab-intro-time">
              <ClockIcon size={16} aria-hidden="true" />약 10분
            </span>
            <div className="vocab-intro-body">
              <img className="vocab-intro-image" src={TEST_INTRO_IMAGE} alt="" />
              <ol className="vocab-intro-steps">
                <li>자주 쓰는 단어부터 하나씩 보여 줄게.</li>
                <li>뜻을 떠올려 보고, 알고 있는지 답해 줘.</li>
                <li>결과에 맞는 단어부터 공부를 시작하자.</li>
              </ol>
            </div>
          </div>
        </main>
        <div className="bottom-cta vocab-actions vocab-cta">
          <button type="button" className="button button-primary" onClick={start}>
            시작하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <main className="page-content">
        <div className="vocab-column">
          <div className="vocab-progress">
            <div className="vocab-progress-top">
              <Link to="/" replace className="nav-button" aria-label="그만하기">
                <XIcon size={24} weight="bold" aria-hidden="true" />
              </Link>
              <span className="vocab-progress-count">
                {progress.index + 1} / {words.length}
              </span>
            </div>
            <span className="vocab-bar" aria-hidden="true">
              <span style={{ width: `${((progress.index + 1) / words.length) * 100}%` }} />
            </span>
            <p className="vocab-progress-stage">
              <strong>{stageLabel(progress.band)}</strong> {rangeLabel(progress.band)}
            </p>
          </div>
          <section className="study-card vocab-card" aria-live="polite">
            <span className="study-word">
              <strong lang={language} className="word-display" style={wordSizeStyle(forms.main)}>
                {forms.main}
              </strong>
              {forms.sub && <small lang={language}>{forms.sub}</small>}
            </span>
            {isRevealed ? (
              <span className="word-meaning">{word.meaningKo}</span>
            ) : (
              <button type="button" className="reveal-button" onClick={() => setIsRevealed(true)}>
                <EyeIcon size={18} aria-hidden="true" />
                뜻 보기
              </button>
            )}
          </section>
        </div>
      </main>
      <div className="bottom-cta vocab-actions vocab-cta">
        <button type="button" className="button button-again" onClick={() => answer(false)}>
          모르겠어
        </button>
        <button type="button" className="button button-good" onClick={() => answer(true)}>
          알고 있어
        </button>
      </div>
    </div>
  )
}

export default VocabTestPage
