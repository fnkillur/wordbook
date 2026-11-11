import { useState } from 'react'
import { useNavigate } from 'react-router'
import { WORDS } from '../data/words'
import { useWordStates } from '../db/hooks'
import { BOOKS, bookWords, type Book } from '../domain/books'
import { learningLanguage } from '../settings'

const OPEN_MS = 420
const BOOKS_PER_SHELF = 3

const shelvesOf = (books: Book[]) => Array.from({ length: Math.ceil(books.length / BOOKS_PER_SHELF) }, (_, row) => books.slice(row * BOOKS_PER_SHELF, (row + 1) * BOOKS_PER_SHELF))

const prefersReducedMotion = () => typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 제초 검정 급수 교재를 책장에 꽂아 두고, 고른 책을 표지를 넘기듯 펼친다.
function WordsPage() {
  const navigate = useNavigate()

  const states = useWordStates()

  const [openingId, setOpeningId] = useState<string | null>(null)

  const language = learningLanguage()

  const progressOf = (book: Book) => {
    const words = bookWords(book, WORDS[language])
    const done = words.filter(word => {
      const status = states?.get(word.id)
      return status === 'made' || status === 'known'
    }).length
    return { done, total: words.length }
  }

  const openBook = (book: Book) => {
    if (openingId) return
    if (prefersReducedMotion()) {
      navigate(`/words/${book.id}`)
      return
    }
    setOpeningId(book.id)
    setTimeout(() => navigate(`/words/${book.id}`), OPEN_MS)
  }

  return (
    <div className="page">
      <main className="page-content">
        <h1 className="page-title">책장</h1>
        {/* 원작 그림체의 나무 서랍장: 칸마다 책이 서 있고, 아래에 서랍과 다리가 있다. */}
        <div className="bookshelf">
          {shelvesOf(BOOKS).map(shelf => (
            <div key={shelf[0].id} className="shelf-row">
              {shelf.map(book => (
                <BookCover key={book.id} book={book} {...progressOf(book)} isOpening={openingId === book.id} onOpen={() => openBook(book)} />
              ))}
            </div>
          ))}
          <div className="shelf-drawer" aria-hidden="true">
            <span />
          </div>
        </div>
        <div className="shelf-legs" aria-hidden="true">
          <span />
          <span />
        </div>
      </main>
    </div>
  )
}

type BookCoverProps = { book: Book; done: number; total: number; isOpening: boolean; onOpen: () => void }

function BookCover({ book, done, total, isOpening, onOpen }: BookCoverProps) {
  const isEmpty = total === 0

  return (
    <button type="button" className={`book${isOpening ? ' is-opening' : ''}`} disabled={isEmpty} onClick={onOpen}>
      <span className="book-tabs" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {/* 표지를 넘기면 보이는 속지: 줄 친 흰 공책 */}
      <span className="book-inner" aria-hidden="true" />
      <span className="book-cover">
        {/* 원작의 제초 검정 책 표지처럼 두 글자씩 세 줄로 쓴다. */}
        <span className="book-title" aria-label={book.title}>
          <span>제</span>
          <span>초</span>
          <span>검</span>
          <span>정</span>
          <span>{book.grade}</span>
          <span>
            급<CrownMark />
          </span>
        </span>
        <span className="book-progress">{isEmpty ? '준비 중' : `${done} / ${total}`}</span>
      </span>
    </button>
  )
}

function CrownMark() {
  return (
    <svg className="book-crown" viewBox="0 0 26 20" aria-hidden="true">
      <path d="M2 18 L2.5 5 L8.5 11 L13 2.5 L17.5 11 L23.5 5 L24 18 Z" />
    </svg>
  )
}

export default WordsPage
