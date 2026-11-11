import type { WordEntry } from '../data/words'
import type { CardType, Grade } from '../domain/schedule'
import type { Language } from '../platform'

export const questionOf = (type: CardType, language: Language) => {
  if (type === 'produce') return `이건 ${language === 'ja' ? '일본어' : '영어'}로 뭐라고 할까?`
  if (type === 'recognize') return '이 단어는 무슨 뜻일까?'
  if (type === 'listen') return '잘 듣고 맞혀 봐!'
  if (type === 'cloze') return '빈칸에 들어갈 말은?'
  return '듣고 철자를 써 볼래?'
}

export const makePromptOf = (hasImage: boolean) => (hasImage ? '좋아! 기억할 한 줄도 적어 볼래?' : '이 단어에 어울리는 그림을 찾아 줄래?')

// 플루언트 포에버의 '개인적 연결': 내 경험에 붙인 단어가 오래 남으니, 떠올릴 거리를 물어서 쓰기를 권한다.
export const MEMO_PROMPTS = ['이 단어 하면 떠오르는 나만의 기억은?', '떠오르는 사람이나 장소가 있어?', '이 단어를 처음 보거나 들은 순간은?']

// 같은 단어는 열 때마다 같은 질문이 나오게 단어 id로 고른다.
export const memoPromptOf = (wordId: string) => MEMO_PROMPTS[[...wordId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % MEMO_PROMPTS.length]

export const reactionOf = (grade: Grade, word: WordEntry) => (grade === 'good' ? `정답! ${word.text}` : '괜찮아, 금방 다시 나올게')

// 효과 카드 아래 문구. 실제 화면과 효과 미리 보기가 같은 말을 쓴다.
export const EFFECT_MESSAGE = {
  cards: '잘하고 있어!',
  goal: '오늘 목표 달성!',
  tough: '괜찮아, 내일 또 하자',
  defeat: '여기부터는 아직 어려워! 여기서부터 배우자',
}

