import { useEffect } from 'react'
import type { Celebration } from '../characters/effects'
import { getSettings } from '../settings'

// 화면 가운데에 효과를 크게 띄운다. 아무 데나 누르면 바로 닫혀서 공부 흐름을 막지 않는다.
function EffectOverlay({ celebration, message, onClose }: { celebration: Celebration; message?: string; onClose: () => void }) {
  useEffect(() => {
    // 움짤은 끝이 없어서 정해 둔 시간(한 바퀴 단위) 뒤에 닫고, 영상은 끝나면 닫는다.
    if (celebration.kind !== 'image') return
    const timer = setTimeout(onClose, celebration.durationMs ?? 2000)
    return () => clearTimeout(timer)
  }, [celebration, onClose])

  return (
    <div className="effect-overlay" role="presentation" onClick={onClose}>
      {/* 그림과 문구를 같은 책 페이지 카드 한 장에 담는다. */}
      <figure className="effect-card">
        {celebration.kind === 'video' ? (
          <video src={celebration.src} autoPlay playsInline muted={getSettings().soundOff} onEnded={onClose} />
        ) : (
          <img src={celebration.src} alt="" />
        )}
        {message && <figcaption className="effect-message">{message}</figcaption>}
      </figure>
    </div>
  )
}

export default EffectOverlay
