import { XIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { DEFEAT_EFFECTS, pickImage } from '../characters/effects'
import { EXAM_INTRO_IMAGE, LICENSE_BRAG_VIDEO, licenseImageOf } from '../characters/slots'
import DefeatScene from '../components/DefeatScene'
import StudyImage from '../components/StudyImage'
import { TEST_WORDS } from '../data/vocabTest'
import { WORDS, type WordEntry } from '../data/words'
import { examProgress, getMedia, learnedWords, postponeToTomorrow, saveExamResult } from '../db/repository'
import { checkAnswer, englishWordSet, gradeLabel, GRADES, gradeRule, pickQuestions, type Answer, type ExamStatus } from '../domain/exam'
import { DEVICE_PERSON, type Language } from '../platform'
import { getSettings, learningLanguage } from '../settings'

type Question = { word: WordEntry; image: Blob | null }
type Exam = { grade: number; pass: number; questions: Question[] }
type Answered = { word: WordEntry; answer: Answer }
type ExamOutcome = { grade: number; pass: number; correct: number; total: number; passed: boolean; missed: WordEntry[] }

const FAILED_MESSAGE = '괜찮아, 내일 다시 보자'

const ENGLISH_WORDS = englishWordSet([...WORDS.en, ...TEST_WORDS.en].map(word => word.text))

const feedbackOf = (answer: Answer) => {
  if (answer === 'correct') return '맞았어!'
  if (answer === 'almost') return '거의 맞았어! 철자만 다시 봐'
  return '아쉬워'
}

// 일본어는 표기와 읽기가 다르면 함께 보여 준다.
const answerTextOf = (word: WordEntry, language: Language) => (language === 'ja' && word.reading && word.reading !== word.text ? `${word.text} (${word.reading})` : word.text)

const isPassed = (grade: number, current: number | null) => current !== null && grade >= current

const statusTextOf = (status: ExamStatus, pass: number, questions: number) => {
  if (status.kind === 'ready') return `${questions}문제 중 ${pass}개 맞히면 합격`
  if (status.kind === 'retry-tomorrow') return '오늘은 봤으니 내일 다시 볼 수 있어'
  return '둘 다 채우면 시험을 볼 수 있어'
}

// 일본어는 한자·읽기 어느 쪽으로 써도 정답이라 입력칸에서 알려 준다.
const placeholderOf = (language: Language) => (language === 'ja' ? '한자나 히라가나로 써 줘' : '단어를 써 줘')

// 급수마다 어느 정도 대화가 되는지. 1급이 외국인과 프리토킹하는 수준이다.
const GRADE_LEVELS: Record<number, string> = { 5: '기초 단어', 4: '기초 회화', 3: '익숙한 주제로 대화', 2: '일상 대화', 1: '외국인과 프리토킹' }

// 제초 검정: 익힌 단어를 그림(없으면 뜻)으로 보고 직접 써서 맞힌다. 중간에 나가면 없던 일이 된다.
function ExamPage() {
  const navigate = useNavigate()

  const language = learningLanguage()
  const person = getSettings().person ?? DEVICE_PERSON

  const today = useToday()

  const progress = useLiveQuery(() => examProgress(language, new Date()), [language, today])

  // 마지막 문제를 빠르게 두 번 눌러 결과를 두 번 저장하지 않게 막는다.
  const isFinishing = useRef(false)

  const [exam, setExam] = useState<Exam | null>(null)
  const [answers, setAnswers] = useState<Answered[]>([])
  const [input, setInput] = useState('')
  const [checked, setChecked] = useState<Answer | null>(null)
  const [outcome, setOutcome] = useState<ExamOutcome | null>(null)
  const [defeatImage, setDefeatImage] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const rule = progress?.status.kind === 'ready' ? gradeRule(progress.status.grade) : null
  const question = exam?.questions[answers.length]
  const isLast = exam !== null && answers.length === exam.questions.length - 1

  const start = async () => {
    if (!rule || isStarting) return
    setIsStarting(true)
    const words = pickQuestions(await learnedWords(language), rule.questions)
    const questions = await Promise.all(words.map(async word => ({ word, image: await getMedia(word.id, 'image') })))
    setExam({ grade: rule.grade, pass: rule.pass, questions })
  }

  const finish = async (all: Answered[]) => {
    if (!exam || isFinishing.current) return
    isFinishing.current = true
    setSaveFailed(false)
    const now = new Date()
    const correct = all.filter(item => item.answer !== 'wrong').length
    const passed = correct >= exam.pass
    const missed = all.filter(item => item.answer === 'wrong').map(item => item.word)
    try {
      await saveExamResult(language, { takenAt: now.toISOString(), grade: exam.grade, correct, total: all.length, passed })
      if (missed.length > 0) await postponeToTomorrow(missed.map(word => word.id), now)
    } catch {
      isFinishing.current = false
      setSaveFailed(true)
      return
    }
    if (!passed) setDefeatImage(pickImage(DEFEAT_EFFECTS).src)
    setOutcome({ grade: exam.grade, pass: exam.pass, correct, total: all.length, passed, missed })
  }

  const check = () => {
    if (!question || checked || !input.trim()) return
    setChecked(checkAnswer(question.word, input, ENGLISH_WORDS))
  }

  const next = () => {
    if (!question || !checked) return
    const all = [...answers, { word: question.word, answer: checked }]
    // 마지막 문제는 저장이 끝날 때까지 답을 그대로 둔다. 실패하면 다시 누를 수 있다.
    if (isLast) {
      finish(all)
      return
    }
    setInput('')
    setChecked(null)
    setAnswers(all)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 사파리는 한글·일본어 조합을 끝내는 Enter에 isComposing 대신 keyCode 229를 준다.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return
    if (checked) next()
    else check()
  }

  if (outcome) {
    return (
      <div className="page">
        <main className="page-content">
          <div className="vocab-column exam-result">
            {outcome.passed ? (
              <>
                <h1 className="page-title">제초 {outcome.grade}급 합격!</h1>
                <img className="exam-license" src={licenseImageOf(person, outcome.grade)} alt={`제초 ${outcome.grade}급 자격증`} />
                <video className="exam-brag" src={LICENSE_BRAG_VIDEO} autoPlay loop muted playsInline aria-hidden="true" />
              </>
            ) : (
              <>
                <h1 className="page-title">
                  {outcome.correct}/{outcome.total} 맞혔어
                </h1>
                {defeatImage && <DefeatScene image={defeatImage} message={FAILED_MESSAGE} />}
                <p className="vocab-note">합격은 {outcome.pass}개부터야.</p>
              </>
            )}
            {outcome.missed.length > 0 && (
              <section className="exam-missed" aria-label="틀린 단어">
                <h2>틀린 단어 · 내일 복습에 다시 나와</h2>
                <ul>
                  {outcome.missed.map(word => (
                    <li key={word.id}>
                      <strong lang={language}>{answerTextOf(word, language)}</strong>
                      <span>{word.meaningKo}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </main>
        <div className="bottom-cta vocab-cta">
          <button type="button" className="button button-primary" onClick={() => navigate('/', { replace: true })}>
            홈으로
          </button>
        </div>
      </div>
    )
  }

  if (exam && question) {
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
                  {answers.length + 1} / {exam.questions.length}
                </span>
              </div>
              <span className="vocab-bar" aria-hidden="true">
                <span style={{ width: `${((answers.length + 1) / exam.questions.length) * 100}%` }} />
              </span>
              <p className="vocab-progress-stage">
                <strong>제초 {exam.grade}급 검정</strong> 그림을 보고 단어를 써 줘
              </p>
            </div>
            <section className="study-card exam-card" aria-live="polite">
              <div className="exam-prompt">
                {question.image ? (
                  <span className="study-image-frame">
                    <StudyImage image={question.image} />
                  </span>
                ) : (
                  <span className="word-meaning">{question.word.meaningKo}</span>
                )}
              </div>
              <input
                key={question.word.id}
                className="text-input exam-input"
                lang={language}
                value={input}
                placeholder={placeholderOf(language)}
                aria-label="답"
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint={checked ? 'next' : 'done'}
                readOnly={checked !== null}
                onChange={event => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
              />
              {checked && (
                <p className={`exam-feedback is-${checked}`}>
                  <span>{feedbackOf(checked)}</span>
                  <strong lang={language}>{answerTextOf(question.word, language)}</strong>
                </p>
              )}
              {saveFailed && (
                <p className="exam-error" role="alert">
                  결과를 저장하지 못했어. 다시 눌러 줘
                </p>
              )}
            </section>
          </div>
        </main>
        <div className="bottom-cta vocab-cta">
          {checked ? (
            <button type="button" className="button button-primary" onClick={next}>
              {isLast ? '결과 보기' : '다음'}
            </button>
          ) : (
            <button type="button" className="button button-primary" disabled={!input.trim()} onClick={check}>
              확인
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!progress) return null

  return (
    <div className="page">
      <main className="page-content exam-intro-page">
        <div className="vocab-intro-header">
          <h1 className="page-title">제초 검정</h1>
          <Link to="/" replace className="nav-button" aria-label="그만하기">
            <XIcon size={24} weight="bold" aria-hidden="true" />
          </Link>
        </div>
        <img className="exam-intro-image" src={EXAM_INTRO_IMAGE} alt="" />
        <NextExam grade={progress.grade} vocab={progress.vocab} learned={progress.learned} status={progress.status} />
        <GradeLadder grade={progress.grade} target={progress.status.kind === 'top' ? null : progress.status.grade} />
      </main>
      {rule && (
        <div className="bottom-cta vocab-actions vocab-cta">
          <button type="button" className="button button-primary" disabled={isStarting} onClick={start}>
            {rule.grade}급 시험 시작하기
          </button>
        </div>
      )}
    </div>
  )
}

// 시험은 하루 한 번이라, 화면을 켜 둔 채 자정이 지나거나 다음 날 앱으로 돌아오면 날짜를 새로 읽는다.
function useToday() {
  const [today, setToday] = useState(() => new Date().toDateString())

  useEffect(() => {
    const refresh = () => setToday(new Date().toDateString())
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime())
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [today])

  return today
}

type NextExamProps = { grade: number | null; vocab: number; learned: number; status: ExamStatus }

function NextExam({ grade, vocab, learned, status }: NextExamProps) {
  const rule = status.kind === 'top' ? null : gradeRule(status.grade)

  return (
    <section className="exam-section exam-next" aria-label="다음 시험">
      <div className="exam-section-head">
        <h2>{rule ? `${rule.grade}급 시험` : '1급까지 다 땄어!'}</h2>
        <span className="exam-chip">지금 {gradeLabel(grade)}</span>
      </div>
      {rule && status.kind === 'locked' && (
        <>
          <ProgressRow label="어휘량" value={vocab} goal={rule.vocab} />
          <ProgressRow label="익힌 단어" value={learned} goal={rule.learned} />
        </>
      )}
      {rule && <p className="exam-status">{statusTextOf(status, rule.pass, rule.questions)}</p>}
    </section>
  )
}

type ProgressRowProps = { label: string; value: number; goal: number }

function ProgressRow({ label, value, goal }: ProgressRowProps) {
  return (
    <div className="exam-progress">
      <div className="exam-progress-top">
        <span>{label}</span>
        <span>
          {Math.min(value, goal).toLocaleString()} / {goal.toLocaleString()}
        </span>
      </div>
      <span className="vocab-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(1, value / goal) * 100}%` }} />
      </span>
    </div>
  )
}

function GradeLadder({ grade, target }: { grade: number | null; target: number | null }) {
  const classOf = (ladderGrade: number) => {
    if (isPassed(ladderGrade, grade)) return 'is-passed'
    if (ladderGrade === target) return 'is-target'
    return ''
  }

  return (
    <section className="exam-section" aria-label="급수 안내">
      <h2>급수 안내</h2>
      <ul className="exam-ladder">
        {GRADES.map(rule => (
          <li key={rule.grade} className={classOf(rule.grade)}>
            <strong>{rule.grade}급</strong>
            <span>{GRADE_LEVELS[rule.grade]}</span>
            {isPassed(rule.grade, grade) && <span className="exam-ladder-done">땄어</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ExamPage
