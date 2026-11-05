import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { db } from '../db/database'
import { dayPlan, madeCountOn, peekDayPlan, silentWordIds, todaysWords } from '../db/repository'
import { todayQueue } from '../domain/schedule'
import { newWordsLeft, nextStep } from '../domain/session'
import { DEVICE_PERSON, LANGUAGE_OF, type Person } from '../platform'
import { getSettings, saveSettings } from '../settings'
import { backfillAudio } from '../sync/audio'

const PEOPLE: Person[] = ['하치와레', '우사기']

// 계획 1의 마을: 그림 없이 오늘 할 양과 '이어서 하기'만. 마을 그림·집·보수는 계획 2에서 더한다.
function VillagePage() {
  const navigate = useNavigate()

  const [person, setPerson] = useState(() => getSettings().person)

  const today = useLiveQuery(async () => {
    const now = new Date()
    const settings = getSettings()
    const dueCount = todayQueue(await db.cards.toArray(), now, { soundOff: settings.soundOff, silentWords: await silentWordIds() }).length
    const plan = await peekDayPlan(now, settings.goalMinutes)
    return { dueCount, newLeft: newWordsLeft(plan, await madeCountOn(now)) }
  }, [])

  // 오늘 새 단어 수를 처음 연 때 정해 둔다.
  useEffect(() => {
    dayPlan(new Date(), getSettings().goalMinutes)
    backfillAudio()
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
      const [next] = await todaysWords(LANGUAGE_OF[person ?? DEVICE_PERSON], 1)
      if (next) navigate(`/make/${next.id}`)
    }
  }

  if (!person) {
    return (
      <div className="page">
        <main className="page-content village-who">
          <h1 className="page-title">누구세요?</h1>
          {PEOPLE.map(candidate => (
            <button key={candidate} type="button" className="button" onClick={() => choosePerson(candidate)}>
              {candidate} ({LANGUAGE_OF[candidate] === 'ja' ? '일본어' : '영어'})
            </button>
          ))}
        </main>
      </div>
    )
  }

  const isDone = today !== undefined && today.dueCount === 0 && today.newLeft === 0

  return (
    <div className="page">
      <main className="page-content">
        <h1 className="page-title">{person}의 마을</h1>
        <section className="today-card" aria-label="오늘 일하러 가기">
          <span className="today-title">오늘 일하러 가기</span>
          {today && (
            <span className="today-amount">
              복습 {today.dueCount}장 · 새 단어 {today.newLeft}개
            </span>
          )}
          <button type="button" className="button button-primary" disabled={!today || isDone} onClick={handleContinue}>
            {isDone ? '오늘 일 끝!' : '이어서 하기'}
          </button>
        </section>
      </main>
    </div>
  )
}

export default VillagePage
