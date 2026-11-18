import conjugations from './conjugations-ja.json'
import en from './sentences-en.json'
import ja from './sentences-ja.json'

// 빈칸 문장 카드용 문장. before·answer·after를 이으면 원문이고 answer가 빈칸이다.
// reading: 일본어 빈칸 말의 문장 속 꼴 그대로의 읽기(영어는 null). audioPath: public/ 아래 원어민 녹음(없으면 TTS로 읽는다).
// form: 동사·형용사 활용형 문장이면 빈칸이 어떤 꼴인지(~ている, ~かった 등).
// ruby: 일본어 문장의 빈칸 밖 한자 읽기. 문장 전체 글자 기준 [시작, 끝, 읽기].
export type Ruby = [number, number, string]
export type Sentence = { before: string; answer: string; after: string; reading: string | null; translation: string; audioPath: string | null; form?: string; ruby?: Ruby[] }

// JSON에서 읽은 [시작, 끝, 읽기]는 길이를 모르는 배열로 잡혀서, 빌드 스크립트가 만든 모양 그대로 Sentence로 본다.
export const SENTENCES = { ...ja, ...en } as unknown as Record<string, Sentence>

export const CONJUGATIONS = conjugations as unknown as Record<string, Sentence[]>

export const findSentence = (wordId: string) => SENTENCES[wordId] ?? null

// 동사·형용사는 기본 문장 뒤에 그 말이 자주 쓰이는 활용형 문장이 이어진다. 기초 625 동사·형용사는 활용형 문장만 있다.
export const sentencesOf = (wordId: string) => [findSentence(wordId), ...(CONJUGATIONS[wordId] ?? [])].filter((sentence): sentence is Sentence => !!sentence)

// 빈칸 카드를 복습할 때마다 다음 문장으로 넘어가서, 같은 말을 여러 꼴로 만난다.
export const sentenceForTurn = (wordId: string, turn: number) => {
  const sentences = sentencesOf(wordId)
  if (sentences.length === 0) return null
  const index = turn % sentences.length
  return { sentence: sentences[index], index }
}

const FORM_LABELS: Record<string, string> = {
  '~た': '과거',
  '~かった': '과거',
  '~だった': '과거',
  '~ない': '부정',
  '~くない': '부정',
  '~なかった': '과거 부정',
  '~ます': '존댓말',
  '~ました': '존댓말 과거',
  '~ません': '존댓말 부정',
  '~て': '연결',
  '~くて': '연결',
  '~で': '연결',
  '~ている': '진행·상태',
  '~ていた': '과거 진행·상태',
  '~ていない': '아직 안 한 상태',
  '~く': '부사',
  '~に': '부사',
  '~な': '명사 꾸밈',
  '~くなる': '변화(~해지다)',
  '~になる': '변화(~해지다)',
  '~れる/~られる': '수동·가능',
  '~せる/~させる': '사역(~하게 하다)',
  '~ていく/~てくる': '~해 가다/오다',
  '~てくれる': '~해 주다(나에게)',
  '~てあげる': '~해 주다(남에게)',
  '~てしまう': '~해 버리다',
  '~てみる': '~해 보다',
  '~ておく': '~해 두다',
  '~そう': '~해 보이다',
  '~すぎる': '너무 ~하다',
  '~たい': '바람(~하고 싶다)',
  '~よう/~おう': '의지·권유',
  '~ば': '가정',
  '~ければ': '가정',
  '~たら': '가정(~하면)',
}

// 문제에 원형이나 어미를 보여 주면 답이 바로 보여서, 앞면에는 어떤 꼴인지 이름만 알려 준다.
export const formLabelOf = (form: string) => FORM_LABELS[form] ?? form

// 기초 단어의 な형용사는 静かな처럼 な까지 적혀 있어서, 힌트에서는 な를 떼고 어간에서 바꾸는 꼴을 보여 준다.
export const conjugationHintOf = (text: string, form: string) => `${text.replace(/な$/, '')} → ${form}`

export const sentenceTextOf = (sentence: Sentence) => `${sentence.before}${sentence.answer}${sentence.after}`

const textHash = (text: string) => [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.codePointAt(0)!) | 0, 7).toString(36).replace('-', 'n')

// 받아 둔 문장 음성은 문장 글자와 녹음 출처로 이름을 짓는다. 문장을 바꾸거나 잘린 녹음을 빼서 TTS로 바뀌면 이름이 달라져 다시 받는다.
export const sentenceAudioKind = (sentence: Sentence) => `sentence-${textHash(`${sentenceTextOf(sentence)}|${sentence.audioPath ?? 'tts'}`)}` as const

// 문장의 한 조각(offset부터 시작하는 text)을 읽기가 붙는 한자와 나머지 글자로 나눈다.
export const rubySegments = (text: string, offset: number, ruby: Ruby[] | undefined) => {
  const segments: { text: string; reading?: string }[] = []
  let position = 0
  for (const [start, end, reading] of ruby ?? []) {
    const [from, to] = [start - offset, end - offset]
    if (from < position || to > text.length) continue
    if (from > position) segments.push({ text: text.slice(position, from) })
    segments.push({ text: text.slice(from, to), reading })
    position = to
  }
  if (position < text.length) segments.push({ text: text.slice(position) })
  return segments
}

const KANJI = /\p{Script=Han}/u

// 빈칸 말의 읽기는 말 전체 읽기라서, 앞뒤에 같은 가나(食べた의 べた)를 떼고 남은 한자 위에만 단다.
export const answerRuby = (answer: string, reading: string | null) => {
  if (!reading || !KANJI.test(answer)) return [{ text: answer }]
  let head = 0
  while (head < answer.length && !KANJI.test(answer[head]) && answer[head] === reading[head]) head += 1
  let tail = 0
  while (
    tail < answer.length - head &&
    !KANJI.test(answer[answer.length - 1 - tail]) &&
    answer[answer.length - 1 - tail] === reading[reading.length - 1 - tail]
  )
    tail += 1
  const segments: { text: string; reading?: string }[] = []
  if (head > 0) segments.push({ text: answer.slice(0, head) })
  segments.push({ text: answer.slice(head, answer.length - tail), reading: reading.slice(head, reading.length - tail) })
  if (tail > 0) segments.push({ text: answer.slice(answer.length - tail) })
  return segments
}
