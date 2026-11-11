import type { Person } from '../platform'
import hachiwareAsk from './images/hachiware-ask.webp'
import chiikawaStudy from './images/chiikawa-study.webp'
import examGate from './images/exam-gate.webp'
import examIntro from './images/exam-intro.webp'
import hachiwareQuizFace from './images/hachiware-quiz-face.webp'
import hachiwareQuiz from './images/hachiware-quiz.webp'
import homeStudyPoster from './images/home-study-poster.webp'
import homeStudy from './images/home-study.mp4'
import shopArmor from './images/shop-armor.webp'
import testIntro from './images/test-intro.webp'
import usagiLicenseBrag from './images/usagi-license-brag.mp4'
import usagiRapStill from './images/usagi-rap-still.webp'
import usagiRap from './images/usagi-rap.webp'
import usagiWiggleStill from './images/usagi-wiggle-still.webp'
import usagiWiggle from './images/usagi-wiggle.webp'

export type Pose = 'ask' | 'happy' | 'cheer'
export type Guest = '치이카와' | '모몬가' | '쿠리만쥬'
export type CharacterName = Person | Guest

const POSE_LABEL: Record<Pose, string> = { ask: '부탁', happy: '기쁨', cheer: '다독임' }

// 그림을 받으면 '이름-동작' 자리에 경로를 넣는다. 비어 있는 자리는 대체 모습으로 그린다.
const IMAGES: Partial<Record<`${CharacterName}-${Pose}`, string>> = {
  '하치와레-ask': hachiwareAsk,
}

// 집에서는 하치와레가 공부하고 있다.
// poster: 영상 첫 장면. 영상이 준비되기 전에 웹뷰가 큰 재생 아이콘을 그리지 않게 같은 장면을 먼저 보여 준다.
export const HOME_SCENE = { name: '치이카와네 집', video: homeStudy, poster: homeStudyPoster }

export const TEST_INTRO_IMAGE = testIntro

export const EXAM_INTRO_IMAGE = examIntro

export const EXAM_GATE_IMAGE = examGate

// 자격증 그림은 원본에서 급수 숫자만 바꾼 복사본이다(scripts/images/license_cards.py).
const LICENSE_IMAGES = import.meta.glob<string>('./images/license-*.webp', { eager: true, import: 'default' })

export const licenseImageOf = (person: Person, grade: number) => LICENSE_IMAGES[`./images/license-${person === '우사기' ? 'usagi' : 'hachiware'}-${grade}.webp`]

export const LICENSE_BRAG_VIDEO = usagiLicenseBrag

// 할 일을 알려 주고 문제를 내는 건 두 사람 모두 하치와레다. 사람마다 다른 건 배우는 언어뿐이다.
export const HOST: CharacterName = '하치와레'

// 복습에서 하치와레가 치이카와에게 제초 검정 문제를 내는 장면.
export const QUIZ_SCENE = hachiwareQuiz

// 폴드처럼 세로가 짧은 폰에서 카드 그림 자리를 넓히려고, 장면 대신 말풍선 옆에 작게 두는 얼굴.
// 단어 카드는 문제를 내는 하치와레(왼쪽을 보고 있어 말풍선 오른쪽에), 빈칸 카드는 공부하는 치이카와.
export const QUIZ_AVATARS = { word: hachiwareQuizFace, cloze: chiikawaStudy }

// 복습 답 버튼의 우사기: 몰랐어는 씰룩씰룩, 알았어는 랩. 답을 떠올리는 동안은 멈춰 있고, 누른 쪽만 움직인다.
export const ANSWER_IMAGES = {
  again: { still: usagiWiggleStill, moving: usagiWiggle },
  good: { still: usagiRapStill, moving: usagiRap },
}

// 상점은 갑옷씨가 지키는 가게다.
export const SHOP_SCENE = shopArmor

export const characterImage = (name: CharacterName, pose: Pose) => IMAGES[`${name}-${pose}`] ?? null

export const poseLabel = (pose: Pose) => POSE_LABEL[pose]
