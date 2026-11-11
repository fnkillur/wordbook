import { EFFECT_MESSAGE } from '../characters/lines'

// 급수 시험은 누구나 어려운 구간에서 끝나서, 탈락 장면을 귀엽게 보여 주고 거기서부터 배우자고 한다.
function DefeatScene({ image, message = EFFECT_MESSAGE.defeat }: { image: string; message?: string }) {
  return (
    <section className="vocab-defeat">
      <img src={image} alt="" />
      <p className="speech-bubble">{message}</p>
    </section>
  )
}

export default DefeatScene
