import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findSentence, SENTENCES } from './sentences'

describe('빈칸 문장', () => {
  it('일본어 문장은 빈칸 앞·빈칸 말·뒤와 문장 속 꼴의 읽기, 번역을 준다', () => {
    expect(findSentence('ja-f00001')).toMatchObject({ before: '彼はテニスを', answer: 'します', after: '。', reading: 'します' })
    expect(findSentence('ja-f00001')?.translation).not.toBe('')
  })

  it('영어 문장은 읽기가 없다', () => {
    expect(findSentence('en-f00001')).toMatchObject({ answer: 'get', reading: null })
  })

  it('기초 단어와 학습 목록에서 뺀 단어는 문장이 없다', () => {
    expect(findSentence('ja-0001')).toBeNull()
    expect(findSentence('en-f00104')).toBeNull()
  })

  it('모든 문장에 빈칸 말이 있고, 녹음 경로는 실제 파일을 가리킨다', () => {
    const sentences = Object.values(SENTENCES)
    expect(sentences.length).toBeGreaterThan(1900)
    sentences.forEach(sentence => expect(sentence.answer).not.toBe(''))
    sentences.filter(sentence => sentence.audioPath).forEach(sentence => expect(existsSync(`public/${sentence.audioPath}`)).toBe(true))
    expect(sentences.filter(sentence => sentence.audioPath).length).toBeGreaterThan(1100)
  })
})
