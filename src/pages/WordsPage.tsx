import { useState } from 'react'
import { Link } from 'react-router'
import { WORDS } from '../data/words'
import type { WordStatus } from '../db/database'
import { useWordStates } from '../db/hooks'
import { DEVICE_PERSON, LANGUAGE_OF } from '../platform'
import { getSettings } from '../settings'

type Filter = 'todo' | 'made' | 'known'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todo', label: '만들 단어' },
  { value: 'made', label: '만든 단어' },
  { value: 'known', label: '아는 단어' },
]

const matchesFilter = (status: WordStatus, filter: Filter) => {
  if (filter === 'made') return status === 'made'
  if (filter === 'known') return status === 'known'
  return status === 'new' || status === 'skipped'
}

// 625 기초 단어를 상태별로 보고, 건너뛴 단어나 아는 단어도 골라 다시 만들 수 있다.
function WordsPage() {
  const states = useWordStates()

  const [filter, setFilter] = useState<Filter>('todo')

  const language = LANGUAGE_OF[getSettings().person ?? DEVICE_PERSON]
  const words = WORDS[language].filter(word => matchesFilter(states?.get(word.id) ?? 'new', filter))

  return (
    <div className="page">
      <main className="page-content">
        <h1 className="page-title">단어장</h1>
        <div className="segmented" role="radiogroup" aria-label="단어 상태">
          {FILTERS.map(option => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={filter === option.value}
              className="segmented-option"
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <ul className="word-list">
          {words.map(word => (
            <li key={word.id}>
              <Link to={`/make/${word.id}`} className="word-row">
                <span className="word-order">{word.order}</span>
                <strong lang={language}>{word.text}</strong>
                <span className="word-reading">{word.reading}</span>
                <span className="word-theme">{word.theme}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

export default WordsPage
