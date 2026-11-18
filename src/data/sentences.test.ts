import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { answerRuby, conjugationHintOf, CONJUGATIONS, formLabelOf, findSentence, rubySegments, SENTENCES, sentenceForTurn, sentencesOf } from './sentences'

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

  it('형용사도 자주 쓰는 활용형 문장이 있다', () => {
    expect(sentencesOf('ja-0581').map(sentence => sentence.form)).toContain('~に')
    expect(sentencesOf('ja-f00296').slice(1).map(sentence => sentence.form)).toContain('~かった')
  })

  it('힌트는 な형용사의 な를 떼고 어간에서 어떤 꼴로 바꾸는지 보여 준다', () => {
    expect(conjugationHintOf('静かな', '~に')).toBe('静か → ~に')
    expect(conjugationHintOf('高い', '~くない')).toBe('高い → ~くない')
  })

  it('문제에서는 단어 원형 없이 과거·존댓말 같은 꼴 이름만 알려 준다', () => {
    expect(formLabelOf('~た')).toBe('과거')
    expect(formLabelOf('~ません')).toBe('존댓말 부정')
    const forms = new Set(Object.values(CONJUGATIONS).flat().map(sentence => sentence.form!))
    expect([...forms].filter(form => formLabelOf(form) === form)).toEqual([])
  })

  it('동사 150개·형용사 100개 안팎에 활용형 문장이 있고, 녹음 경로는 실제 파일을 가리킨다', () => {
    const sentences = Object.values(CONJUGATIONS).flat()
    expect(Object.keys(CONJUGATIONS).length).toBeGreaterThan(230)
    sentences.forEach(sentence => expect(sentence.answer).not.toBe(''))
    sentences.filter(sentence => sentence.audioPath).forEach(sentence => expect(existsSync(`public/${sentence.audioPath}`)).toBe(true))
  })
})

describe('후리가나', () => {
  it('빈칸 밖 한자에 읽기가 있고, 빈칸 말에는 붙이지 않는다', () => {
    const sentence = Object.values(SENTENCES).find(item => item.ruby?.length)!
    const answerStart = sentence.before.length
    const answerEnd = answerStart + sentence.answer.length
    sentence.ruby!.forEach(([start, end]) => expect(end <= answerStart || start >= answerEnd).toBe(true))
  })

  it('문장 조각을 읽기가 붙는 한자와 나머지로 나눈다', () => {
    const ruby: [number, number, string][] = [[0, 2, 'でんき'], [2, 3, 'だい'], [9, 11, 'ちゃん']]
    expect(rubySegments('電気代はちゃんと', 0, ruby)).toEqual([
      { text: '電気', reading: 'でんき' },
      { text: '代', reading: 'だい' },
      { text: 'はちゃんと' },
    ])
    expect(rubySegments('を払う', 5, [[3, 4, 'そ'], [6, 7, 'はら']])).toEqual([{ text: 'を' }, { text: '払', reading: 'はら' }, { text: 'う' }])
    expect(rubySegments('ねえ', 0, undefined)).toEqual([{ text: 'ねえ' }])
  })
})

describe('answerRuby', () => {
  it('빈칸 말의 읽기는 앞뒤 가나를 빼고 한자 위에만 단다', () => {
    expect(answerRuby('食べた', 'たべた')).toEqual([{ text: '食', reading: 'た' }, { text: 'べた' }])
    expect(answerRuby('お茶', 'おちゃ')).toEqual([{ text: 'お' }, { text: '茶', reading: 'ちゃ' }])
    expect(answerRuby('電気', 'でんき')).toEqual([{ text: '電気', reading: 'でんき' }])
  })

  it('한자가 없거나 읽기가 없으면 읽기를 달지 않는다', () => {
    expect(answerRuby('します', 'します')).toEqual([{ text: 'します' }])
    expect(answerRuby('get', null)).toEqual([{ text: 'get' }])
  })
})
