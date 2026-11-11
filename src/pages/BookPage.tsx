import { CaretLeftIcon, EraserIcon, NotePencilIcon, PencilSimpleIcon, PencilSimpleSlashIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { wordFormsOf } from '../components/wordForms'
import { WORDS, type WordEntry } from '../data/words'
import { db, type WordStatus } from '../db/database'
import { useWordStates } from '../db/hooks'
import { markWords } from '../db/repository'
import { chaptersOf, findBook, type Book } from '../domain/books'
import type { Language } from '../platform'
import { learningLanguage } from '../settings'

type Filter = 'todo' | 'made' | 'known'

// 책 위에 붙은 인덱스 탭. 제초 검정 책에 붙어 있던 색 탭처럼 색으로도 구분한다.
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todo', label: '만들 단어' },
  { value: 'made', label: '만든 단어' },
  { value: 'known', label: '아는 단어' },
]

const isFilter = (value: string | null): value is Filter => FILTERS.some(option => option.value === value)

const matchesFilter = (status: WordStatus, filter: Filter) => {
  if (filter === 'made') return status === 'made'
  if (filter === 'known') return status === 'known'
  return status === 'new' || status === 'skipped'
}

const emptyTextOf = (filter: Filter) => {
  if (filter === 'made') return '아직 만든 단어가 없어.'
  if (filter === 'known') return '아는 단어로 넘긴 단어가 없어.'
  return '이 책의 단어를 모두 뗐어!'
}

function BookPage() {
  const { bookId } = useParams()

  const book = bookId ? findBook(bookId) : null

  if (!book) return <Navigate to="/words" replace />
  return <BookView key={book.id} book={book} />
}

// 공책처럼 줄 친 종이에 장별로 단어를 적어 두고, 연필로 동그라미를 쳐서 아는 단어를 한 번에 넘긴다.
function BookView({ book }: { book: Book }) {
  // 고른 탭은 주소에 둬서, 단어를 열었다가 뒤로 와도 같은 탭이 열린다.
  const [searchParams, setSearchParams] = useSearchParams()

  const states = useWordStates()
  const memoWordIds = useLiveQuery(async () => new Set((await db.notes.toArray()).filter(note => note.memo.trim()).map(note => note.wordId)), [])

  const [circled, setCircled] = useState<Set<string> | null>(null)

  const tab = searchParams.get('tab')
  const filter: Filter = isFilter(tab) ? tab : 'todo'

  const language = learningLanguage()
  const statusOf = (wordId: string) => states?.get(wordId) ?? 'new'
  const chapters = chaptersOf(book, WORDS[language])
    .map(chapter => ({ ...chapter, words: chapter.words.filter(word => matchesFilter(statusOf(word.id), filter)) }))
    .filter(chapter => chapter.words.length > 0)
  const visible = chapters.flatMap(chapter => chapter.words)
  const isPencil = circled !== null

  const changeFilter = (value: Filter) => {
    setSearchParams(value === 'todo' ? {} : { tab: value }, { replace: true })
    setCircled(null)
  }

  const toggle = (wordId: string) => {
    if (!circled) return
    const next = new Set(circled)
    if (next.has(wordId)) next.delete(wordId)
    else next.add(wordId)
    setCircled(next)
  }

  const markKnown = async () => {
    if (!circled || circled.size === 0) return
    // 만든 단어를 '아는 단어'로 덮으면 오늘 만든 수가 줄어드니, 아직 안 만든 단어만 넘긴다.
    const todo = [...circled].filter(wordId => matchesFilter(statusOf(wordId), 'todo'))
    await markWords(todo, 'known')
    setCircled(null)
  }

  return (
    <div className={`page book-page${isPencil ? ' is-pencil' : ''}`}>
      <main className="page-content">
        <header className="screen-header book-header">
          <Link to="/words" className="nav-button" aria-label="책장으로">
            <CaretLeftIcon size={24} weight="bold" aria-hidden="true" />
          </Link>
          <h1>{book.title}</h1>
          <p className="book-summary">{book.summary}</p>
        </header>

        <div className="index-tabs" role="radiogroup" aria-label="단어 상태">
          {FILTERS.map(option => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={filter === option.value}
              className="index-tab"
              data-filter={option.value}
              onClick={() => changeFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <section className="paper" data-filter={filter}>
          {filter === 'todo' && visible.length > 0 && (
            <div className="paper-tools">
              {isPencil ? (
                <>
                  <span className="pencil-hint">아는 단어에 동그라미 쳐 줘</span>
                  <button type="button" className="text-button pencil-button" onClick={() => setCircled(null)}>
                    <PencilSimpleSlashIcon size={18} aria-hidden="true" />
                    내려놓기
                  </button>
                </>
              ) : (
                <button type="button" className="text-button pencil-button" onClick={() => setCircled(new Set())}>
                  <PencilSimpleIcon size={18} aria-hidden="true" />
                  연필 들기
                </button>
              )}
            </div>
          )}
          {chapters.map(chapter => (
            <section key={chapter.title} className="book-chapter">
              <h2>{chapter.title}</h2>
              <ul>
                {chapter.words.map(word => (
                  <li key={word.id}>
                    <WordLine word={word} language={language} status={statusOf(word.id)} hasMemo={memoWordIds?.has(word.id) ?? false} isPencil={isPencil} isCircled={circled?.has(word.id) ?? false} onCircle={() => toggle(word.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {visible.length === 0 && <p className="paper-empty">{emptyTextOf(filter)}</p>}
        </section>
      </main>

      {isPencil && (
        <div className="bottom-cta pencil-actions">
          <button type="button" className="button" onClick={() => setCircled(new Set())}>
            <EraserIcon size={18} aria-hidden="true" />
            지우개
          </button>
          <button type="button" className="button" onClick={() => setCircled(new Set(visible.map(word => word.id)))}>
            전부
          </button>
          <button type="button" className="button button-primary" disabled={circled.size === 0} onClick={markKnown}>
            아는 단어로 ({circled.size})
          </button>
        </div>
      )}
    </div>
  )
}

type WordLineProps = { word: WordEntry; language: Language; status: WordStatus; hasMemo: boolean; isPencil: boolean; isCircled: boolean; onCircle: () => void }

function WordLine({ word, language, status, hasMemo, isPencil, isCircled, onCircle }: WordLineProps) {
  const forms = wordFormsOf(word, language)
  const content = (
    <>
      <span className="book-word-text">
        <strong lang={language}>{forms.main}</strong>
        {isCircled && <PencilCircle />}
      </span>
      {forms.sub && (
        <span lang={language} className="word-reading">
          {forms.sub}
        </span>
      )}
      <span className="word-theme">{word.meaningKo}</span>
      {/* 기억할 한 줄까지 적은 단어에는 메모지를 붙여 둔다. */}
      {status === 'made' && hasMemo && (
        <span className="book-memo-mark" role="img" aria-label="기억할 한 줄 있음">
          <NotePencilIcon size={16} weight="fill" aria-hidden="true" />
        </span>
      )}
    </>
  )

  if (isPencil) {
    return (
      <button type="button" className="book-word" aria-pressed={isCircled} onClick={onCircle}>
        {content}
      </button>
    )
  }
  return (
    <Link to={`/make/${word.id}`} state={{ fromBook: true }} className={`book-word${status === 'known' ? ' is-known' : ''}`}>
      {content}
    </Link>
  )
}

// 손으로 그린 듯 살짝 찌그러진 연필 동그라미. 그려지는 모습이 보이게 선을 따라 그린다.
function PencilCircle() {
  return (
    <svg className="pencil-circle" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength={1} d="M10 24 C6 10 36 3 60 4 C86 5 98 13 95 23 C92 35 54 39 28 36 C12 34 3 27 9 15" />
    </svg>
  )
}

export default BookPage
