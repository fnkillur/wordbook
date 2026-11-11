import { describe, expect, it } from 'vitest'
import { wordFormsOf } from './wordForms'

describe('wordFormsOf', () => {
  it('일본어는 히라가나 읽기를 크게, 한자 표기를 작게 보여 준다', () => {
    expect(wordFormsOf({ text: '犬', reading: 'いぬ' }, 'ja')).toEqual({ main: 'いぬ', sub: '犬' })
  })

  it('한자가 없는 일본어는 읽기만 보여 준다', () => {
    expect(wordFormsOf({ text: 'もう', reading: 'もう' }, 'ja')).toEqual({ main: 'もう', sub: null })
  })

  it('영어는 철자를 크게, 발음 기호를 작게 보여 준다', () => {
    expect(wordFormsOf({ text: 'dog', reading: 'dɔɡ' }, 'en')).toEqual({ main: 'dog', sub: 'dɔɡ' })
  })
})
