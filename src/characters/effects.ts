import chiikawaBackstep from './effects/chiikawa-backstep.webp'
import chiikawaKeepTrying from './effects/chiikawa-keep-trying.webp'
import chiikawaPanting from './effects/chiikawa-panting.webp'
import hachiwareDefeat from './effects/hachiware-defeat.webp'
import kurimanjuGulp from './effects/kurimanju-gulp.webp'
import shisaSmile from './effects/shisa-smile.webp'
import shisaStudy from './effects/shisa-study.webp'
import usagiRollLook from './effects/usagi-roll-look.webp'
import rolling from './effects/rolling.mp4'
import usagiSoup from './effects/usagi-soup.webp'

// 복습 10장마다 깜짝 보여 주는 효과. 기본 움짤·영상은 처음부터 나오고, 도감에서 물건이 열리면 그 효과 영상이 후보에 더해진다.
// durationMs: 움짤을 보여 줄 시간(영상은 끝나면 닫혀서 없다).
export type Celebration = { kind: 'image' | 'video'; src: string; durationMs?: number }

// 움짤은 끝이 없어서 한 바퀴 길이(loopMs)를 적어 두고 바퀴 단위로 끊는다.
export type Animated = { name: string; src: string; loopMs: number }

const MIN_SHOW_MS = 2000

// 짧은 움짤은 2초를 넘길 때까지 몇 바퀴 돌리고, 긴 건 한 바퀴를 다 보여 줘서 어중간한 데서 끊기지 않게 한다.
export const showFor = (loopMs: number) => loopMs * Math.max(1, Math.ceil(MIN_SHOW_MS / loopMs))

export const BASE_EFFECTS: Animated[] = [
  { name: '우사기 국물먹기', src: usagiSoup, loopMs: 2480 },
  { name: '우사기 뒹굴쳐다보기', src: usagiRollLook, loopMs: 1120 },
  { name: '쿠리만쥬 캬아', src: kurimanjuGulp, loopMs: 3500 },
  { name: '시사 술공부', src: shisaStudy, loopMs: 1100 },
  { name: '시사 방긋', src: shisaSmile, loopMs: 1600 },
]

// 도감 물건이 아니라 둘이 구르는 장면이라 처음부터 나온다.
export const BASE_VIDEOS: { name: string; src: string }[] = [{ name: '롤링', src: rolling }]

export const imageOf = (animated: Animated): Celebration => ({ kind: 'image', src: animated.src, durationMs: showFor(animated.loopMs) })

export const pickCelebration = (unlockedVideos: string[], random: () => number = Math.random): Celebration => {
  const videos = [...BASE_VIDEOS.map(video => video.src), ...unlockedVideos]
  const pool: Celebration[] = [...BASE_EFFECTS.map(imageOf), ...videos.map(src => ({ kind: 'video' as const, src }))]
  return pool[Math.floor(random() * pool.length)]
}

// 급수 시험이 어려운 구간에서 끝났을 때(누구나 한 번은 여기서 끝난다).
export const DEFEAT_EFFECTS: Animated[] = [
  { name: '하치와레 토벌실패', src: hachiwareDefeat, loopMs: 1300 },
  { name: '치이카와 뒷걸음질', src: chiikawaBackstep, loopMs: 800 },
]

// 몰랐어가 많았던 날 끝에 다독일 때.
export const TOUGH_DAY_EFFECTS: Animated[] = [
  { name: '치이카와 힘들어도 노력', src: chiikawaKeepTrying, loopMs: 3000 },
  { name: '치이카와 숨차며 뜀', src: chiikawaPanting, loopMs: 2200 },
]

export const pickImage = (images: Animated[], random: () => number = Math.random) => imageOf(images[Math.floor(random() * images.length)])
