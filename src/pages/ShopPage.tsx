import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { Celebration } from '../characters/effects'
import { SHOP_SCENE } from '../characters/slots'
import EffectOverlay from '../components/EffectOverlay'
import { earnedTotal, ownedItemIds } from '../db/repository'
import { nextUnlock, shopItemsFor, unlockedItems, type ShopItem } from '../domain/shop'
import { COIN } from '../domain/wallet'
import { DEVICE_PERSON } from '../platform'
import { getSettings } from '../settings'
import coinIcon from '../shop/images/coin.webp'

// 도감: 물건을 사지 않고, 공부해서 모은 보수가 값만큼 쌓이면 열린다. 열린 물건은 눌러서 효과를 다시 볼 수 있다.
function ShopPage() {
  const earned = useLiveQuery(earnedTotal)
  const bought = useLiveQuery(async () => new Set(await ownedItemIds()))

  const [playing, setPlaying] = useState<Celebration | null>(null)

  const items = shopItemsFor(getSettings().person ?? DEVICE_PERSON)
  const opened = new Set(unlockedItems(items, earned ?? 0, bought ?? new Set()).map(item => item.id))
  const next = earned === undefined ? null : nextUnlock(items, earned, bought ?? new Set())

  // 도감에서는 긴 영상도 그 물건의 효과를 그대로 다시 본다(낙엽은 둘 중 하나).
  const play = (item: ShopItem) => {
    if (item.effects.length === 0) return
    setPlaying({ kind: 'video', src: item.effects[Math.floor(Math.random() * item.effects.length)] })
  }

  return (
    <div className="page">
      <main className="page-content">
        <h1 className="page-title">도감</h1>
        <section className="shop-scene" aria-label="갑옷씨네 가게">
          <img src={SHOP_SCENE} alt="" />
        </section>
        <section className="shop-wallet" aria-label="모은 보수">
          <img className="shop-wallet-icon" src={coinIcon} alt="" />
          <div className="shop-wallet-text">
            <span className="shop-wallet-label">모은 보수</span>
            <strong className="shop-wallet-amount">{(earned ?? 0).toLocaleString()}</strong>
            <span className="shop-wallet-guide">{next ? `${next.item.name}까지 ${next.left.toLocaleString()} 남았어` : '도감을 다 모았어!'}</span>
            <span className="shop-wallet-guide">
              복습 {COIN.review} · 새 단어 {COIN.make} · 오늘 목표 {COIN.goal}
            </span>
          </div>
        </section>
        <ul className="shop-stall" aria-label="도감 물건">
          {items.map(item => (
            <CollectionItem key={item.id} item={item} isOpened={opened.has(item.id)} onPlay={() => play(item)} />
          ))}
        </ul>
      </main>
      {playing && <EffectOverlay celebration={playing} onClose={() => setPlaying(null)} />}
    </div>
  )
}

function CollectionItem({ item, isOpened, onPlay }: { item: ShopItem; isOpened: boolean; onPlay: () => void }) {
  const canPlay = isOpened && item.effects.length > 0

  return (
    <li className={`shop-item${isOpened ? '' : ' is-locked'}`}>
      <div className="shop-item-frame">
        <div className="shop-item-image" aria-hidden="true">
          {item.image ? <img src={item.image} alt="" /> : item.name.slice(0, 1)}
        </div>
      </div>
      <div className="shop-sign">
        <span className="shop-item-name">{item.name}</span>
        {isOpened ? <span className="shop-item-state">열렸어</span> : <Price amount={item.price} />}
      </div>
      {canPlay && (
        <button type="button" className="card-action shop-item-play" onClick={onPlay}>
          효과 보기
        </button>
      )}
    </li>
  )
}

function Price({ amount }: { amount: number }) {
  return (
    <span className="shop-price">
      <img className="shop-price-icon" src={coinIcon} alt="" />
      {amount.toLocaleString()}이면 열려
    </span>
  )
}

export default ShopPage
