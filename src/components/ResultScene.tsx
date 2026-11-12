import { EFFECT_MESSAGE } from '../characters/lines'

// 급수 시험이나 검정이 어려운 데서 끝났을 때, 탈락 장면을 귀엽게 보여 주고 말풍선으로 다독인다.
function ResultScene({ image, message = EFFECT_MESSAGE.defeat }: { image: string; message?: string }) {
  return (
    <section className="result-scene">
      <img src={image} alt="" />
      <p className="speech-bubble">{message}</p>
    </section>
  )
}

export default ResultScene
