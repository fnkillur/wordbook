import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONJUGATIONS, findSentence, SENTENCES, sentenceForTurn, sentencesOf } from './sentences'

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

describe('동사 활용형 문장', () => {
  const [freqVerb] = Object.keys(CONJUGATIONS).filter(wordId => findSentence(wordId))

  it('빈도 동사는 기본 문장 다음에 자주 쓰는 활용형 문장이 온다', () => {
    const [first, ...rest] = sentencesOf(freqVerb)
    expect(first).toBe(findSentence(freqVerb))
    expect(rest.length).toBeGreaterThan(0)
    rest.forEach(sentence => expect(sentence.form).toBeTruthy())
  })

  it('기초 625 동사는 기본 문장이 없어서 활용형 문장만 있다', () => {
    expect(findSentence('ja-0481')).toBeNull()
    expect(sentencesOf('ja-0481').length).toBeGreaterThan(0)
    sentencesOf('ja-0481').forEach(sentence => expect(sentence.form).toBeTruthy())
  })

  it('복습할 때마다 다음 문장으로 넘어가고 끝까지 가면 처음으로 돌아온다', () => {
    const sentences = sentencesOf(freqVerb)
    expect(sentenceForTurn(freqVerb, 0)).toEqual({ sentence: sentences[0], index: 0 })
    expect(sentenceForTurn(freqVerb, 1)).toEqual({ sentence: sentences[1], index: 1 })
    expect(sentenceForTurn(freqVerb, sentences.length)).toEqual({ sentence: sentences[0], index: 0 })
    expect(sentenceForTurn('ja-0001', 3)).toBeNull()
  })

  it('동사 150개 안팎에 활용형 문장이 있고, 녹음 경로는 실제 파일을 가리킨다', () => {
    const sentences = Object.values(CONJUGATIONS).flat()
    expect(Object.keys(CONJUGATIONS).length).toBeGreaterThan(140)
    sentences.forEach(sentence => expect(sentence.answer).not.toBe(''))
    sentences.filter(sentence => sentence.audioPath).forEach(sentence => expect(existsSync(`public/${sentence.audioPath}`)).toBe(true))
  })
})
