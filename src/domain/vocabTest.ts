export const BAND_SIZE = 1000
export const BAND_COUNT = 10
export const PER_BAND = 20
export const QUICK_PASS = 10
export const START_THRESHOLD = 0.8
export const STOP_THRESHOLD = 0.5
export const FREQ_LIMIT = BAND_SIZE * BAND_COUNT

export type BandScore = { band: number; known: number; total: number }
export type VocabTestResult = { takenAt: string; set: 0 | 1; scores: BandScore[]; estimate: number; startRank: number }

const ratioOf = (score: BandScore) => (score.total === 0 ? 0 : score.known / score.total)

// 아는 비율이 두 구간 연속 절반 아래면 더 어려운 구간은 볼 필요가 없다.
export const shouldStop = (scores: BandScore[]) => {
  if (scores.length >= BAND_COUNT) return true
  const lastTwo = scores.slice(-2)
  return lastTwo.length === 2 && lastTwo.every(score => ratioOf(score) < STOP_THRESHOLD)
}

// 처음 10개를 다 알면 그 구간은 다 안다고 보고 넘어간다. 시작 위치를 가르는 경계 구간만 20개를 다 본다.
export const isBandDone = ({ answered, known, total }: { answered: number; known: number; total: number }) =>
  answered >= total || (answered === QUICK_PASS && known === QUICK_PASS)

// 빈도 순서 그대로면 처음 10개가 구간에서 가장 쉬운 단어로 쏠리니, 하나 건너 하나씩 먼저 묻는다.
export const spreadOrder = <T>(items: T[]) => [...items.filter((_, index) => index % 2 === 0), ...items.filter((_, index) => index % 2 === 1)]

export const estimateKnown = (scores: BandScore[]) => Math.round(scores.reduce((sum, score) => sum + ratioOf(score) * BAND_SIZE, 0))

export const suggestStartRank = (scores: BandScore[]) => {
  if (scores.length === 0) return 1
  const weak = scores.find(score => ratioOf(score) < START_THRESHOLD)
  return (weak ? weak.band : BAND_COUNT) * BAND_SIZE + 1
}

export const nextSet = (previousCount: number): 0 | 1 => (previousCount % 2 === 0 ? 0 : 1)

export const summarize = (scores: BandScore[], set: 0 | 1, now: Date): VocabTestResult => ({
  takenAt: now.toISOString(),
  set,
  scores,
  estimate: estimateKnown(scores),
  startRank: suggestStartRank(scores),
})
