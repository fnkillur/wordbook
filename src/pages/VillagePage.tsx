import { CaretRightIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { EXAM_GATE_IMAGE, HOME_SCENE, licenseImageOf } from '../characters/slots'
import { dayPlan, examResults, freqWordsLeft, knownCards, madeCountOn, peekDayPlan, silentWordIds, startRankOf, todaysWords, vocabTests } from '../db/repository'
import { currentGrade } from '../domain/exam'
import { todayQueue } from '../domain/schedule'
import { newWordsLeft, nextStep } from '../domain/session'
import { FREQ_LIMIT } from '../domain/vocabTest'
import { LANGUAGE_OF, type Language, type Person } from '../platform'
import { getSettings, learningLanguage, learningLanguageOf, saveSettings } from '../settings'
import { backfillAudio } from '../sync/audio'
import { backupIfDue } from '../sync/driveBackup'
import { backfillSentenceAudio } from '../sync/sentenceAudio'

const PEOPLE: Person[] = ['하치와레', '우사기']

const supplyNotice = (startRank: number) =>
  startRank > FREQ_LIMIT ? '자주 쓰는 단어는 거의 다 알아. 더 어려운 단어는 따로 준비할게.' : '새 단어를 준비하고 있어. 그동안 복습이랑 남은 기초 단어를 이어서 하자.'

function VillagePage() {
  const navigate = useNavigate()

  const [person, setPerson] = useState(() => getSettings().person)

  const language = person ? learningLanguageOf({ ...getSettings(), person }) : null
  // 오늘 할 양은 지금 배우는 언어만 센다.
  const today = useLiveQuery(async () => {
    if (!language) return undefined
    const now = new Date()
    const settings = getSettings()
    const dueCount = todayQueue(await knownCards(language), now, { soundOff: settings.soundOff, silentWords: await silentWordIds() }).length
    const plan = await peekDayPlan(now, settings.goalMinutes, language)
    return { dueCount, newLeft: newWordsLeft(plan, await madeCountOn(now, language)) }
  }, [language])
  const hasTested = useLiveQuery(async () => (language ? (await vocabTests(language)).length > 0 : true), [language])
  const wordSupply = useLiveQuery(async () => {
    if (!language) return null
    return { left: await freqWordsLeft(language), startRank: await startRankOf(language) }
  }, [language])

  // 오늘 새 단어 수를 처음 연 때 정해 둔다.
  useEffect(() => {
    dayPlan(new Date(), getSettings().goalMinutes, learningLanguage())
    backfillAudio()
    backfillSentenceAudio()
    backupIfDue().catch(() => undefined)
  }, [])

  const choosePerson = (chosen: Person) => {
    saveSettings({ person: chosen })
    setPerson(chosen)
  }

  const handleContinue = async () => {
    if (!today) return
    const step = nextStep({ dueCount: today.dueCount, newWordsLeft: today.newLeft })
    if (step === 'review') {
      navigate('/study')
      return
    }
    if (step === 'make') {
      const [next] = await todaysWords(learningLanguage(), 1)
      if (next) navigate(`/make/${next.id}`)
    }
  }

  if (!person) {
    return (
      <div className="page">
        <main className="page-content village-who">
          <h1 className="page-title">누구야?</h1>
          {PEOPLE.map(candidate => (
            <button key={candidate} type="button" className="button" onClick={() => choosePerson(candidate)}>
              {candidate} ({LANGUAGE_OF[candidate] === 'ja' ? '일본어' : '영어'})
            </button>
          ))}
        </main>
      </div>
    )
  }

  // 테스트를 한 번도 안 봤으면 시작 위치부터 정하도록 테스트가 첫 화면이 된다.
  // 화면 작업 중에는 .env.android.local의 VITE_SKIP_VOCAB_TEST로 잠시 끌 수 있다. 결과는 저장하지 않아서 끄면 그대로 처음 상태다.
  if (hasTested === false && import.meta.env.VITE_SKIP_VOCAB_TEST !== 'true') return <Navigate to="/test" replace />
  if (hasTested === undefined) return null

  const isDone = today !== undefined && today.dueCount === 0 && today.newLeft === 0

  return (
    <div className="page">
      <main className="page-content village-home">
        <h1 className="page-title">{HOME_SCENE.name}</h1>
        <HomeScene />
        {wordSupply?.left === 0 && <p className="notice">{supplyNotice(wordSupply.startRank ?? 0)}</p>}
        <section className="today-card" aria-label="오늘 공부하기">
          <span className="today-title">오늘 공부하기</span>
          <HeldLicense person={person} language={language} />
          {today && (
            <span className="today-amount">
              복습 {today.dueCount}장 · 새 단어 {today.newLeft}개
            </span>
          )}
          <button type="button" className="button button-primary" disabled={!today || isDone} onClick={handleContinue}>
            {isDone ? '오늘 공부 끝!' : '이어서 하기'}
          </button>
        </section>
        <ExamEntry />
      </main>
    </div>
  )
}

type HeldLicenseProps = { person: Person; language: Language | null }

// 딴 자격증 중 가장 높은 급수를 오늘 공부하기 카드에 걸어 둔다.
function HeldLicense({ person, language }: HeldLicenseProps) {
  const grade = useLiveQuery(async () => (language ? currentGrade(await examResults(language)) : null), [language])

  if (!grade) return null
  return <img className="today-license" src={licenseImageOf(person, grade)} alt={`제초 ${grade}급 자격증`} />
}

function ExamEntry() {
  return (
    <Link to="/exam" className="exam-entry">
      <img src={EXAM_GATE_IMAGE} alt="" />
      <span>
        시험 보러 가기
        <CaretRightIcon size={18} weight="bold" aria-hidden="true" />
      </span>
    </Link>
  )
}

function HomeScene() {
  return (
    <section className="home-scene" aria-label={HOME_SCENE.name}>
      <video src={HOME_SCENE.video} poster={HOME_SCENE.poster} autoPlay muted loop playsInline aria-hidden="true" />
    </section>
  )
}

export default VillagePage
