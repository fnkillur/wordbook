import cameraEffect from '../shop/effects/camera.mp4'
import caneleEffect from '../shop/effects/canele.mp4'
import fallenLeafHachiware from '../shop/effects/fallen-leaf-hachiware.mp4'
import fallenLeafUsagi from '../shop/effects/fallen-leaf-usagi.mp4'
import glowingMushroomEffect from '../shop/effects/glowing-mushroom.mp4'
import guitarEffect from '../shop/effects/guitar.mp4'
import jellyCider2Effect from '../shop/effects/jelly-cider-2.mp4'
import jellyCiderEffect from '../shop/effects/jelly-cider.mp4'
import marshmallowEffect from '../shop/effects/marshmallow.mp4'
import pancakeEffect from '../shop/effects/pancake.mp4'
import pajamaEffect from '../shop/effects/pajama.mp4'
import propellerEffect from '../shop/effects/propeller.mp4'
import pudding2Effect from '../shop/effects/pudding-2.mp4'
import puddingEffect from '../shop/effects/pudding.mp4'
import skullStaffEffect from '../shop/effects/skull-staff.mp4'
import squidSuitEffect from '../shop/effects/squid-suit.mp4'
import steamedBunEffect from '../shop/effects/steamed-bun.mp4'
import swimmingEffect from '../shop/effects/swimming.mp4'
import usagiWeaponEffect from '../shop/effects/usagi-weapon.mp4'
import whistleCandyEffect from '../shop/effects/whistle-candy.mp4'
import yogurtEffect from '../shop/effects/yogurt.mp4'
import camera from '../shop/images/camera.webp'
import canele from '../shop/images/canele.webp'
import fallenLeaf from '../shop/images/fallen-leaf.webp'
import glowingMushroom from '../shop/images/glowing-mushroom.webp'
import guitar from '../shop/images/guitar.webp'
import jellyCider from '../shop/images/jelly-cider.webp'
import marshmallow from '../shop/images/marshmallow.webp'
import pancake from '../shop/images/pancake.webp'
import pajama from '../shop/images/pajama.webp'
import propeller from '../shop/images/propeller.webp'
import pudding from '../shop/images/pudding.webp'
import skullStaff from '../shop/images/skull-staff.webp'
import squidSuit from '../shop/images/squid-suit.webp'
import steamedBun from '../shop/images/steamed-bun.webp'
import swimming from '../shop/images/swimming.webp'
import usagiWeapon from '../shop/images/usagi-weapon.webp'
import whistleCandy from '../shop/images/whistle-candy.webp'
import yogurt from '../shop/images/yogurt.webp'
import type { Person } from '../platform'

// 원작 에피소드에 나온 물건. 사지 않고, 모은 보수가 값만큼 쌓이면 도감에 열린다(며칠~한 달). owner가 있으면 그 사람에게만 보인다.
// 애니 1화부터 차례로 나온 먹거리·놀이가 먼저 열리고, 처음 만든 물건들이 뒤를 잇는다.
// effects: 열리면 보여 줄 효과 영상. 여럿이면 그중 하나를 고른다.
// isLong: 길게 느껴지는 영상이라 10장마다가 아니라 하루 한 번 오늘 목표를 채웠을 때 보여 준다.
export type ShopItem = { id: string; name: string; price: number; owner: Person | null; image?: string; effects: string[]; isLong?: boolean }

const SHOP_ITEMS: ShopItem[] = [
  { id: 'pudding', name: '푸딩', price: 100, owner: null, image: pudding, effects: [puddingEffect, pudding2Effect] },
  { id: 'pancake', name: '팬케이크', price: 200, owner: null, image: pancake, effects: [pancakeEffect] },
  { id: 'steamed-bun', name: '호빵', price: 300, owner: null, image: steamedBun, effects: [steamedBunEffect] },
  { id: 'yogurt', name: '요구르트', price: 400, owner: null, image: yogurt, effects: [yogurtEffect] },
  { id: 'jelly-cider', name: '젤리 사이다', price: 500, owner: null, image: jellyCider, effects: [jellyCiderEffect, jellyCider2Effect] },
  { id: 'marshmallow', name: '마시멜로', price: 600, owner: null, image: marshmallow, effects: [marshmallowEffect] },
  { id: 'canele', name: '까눌레', price: 700, owner: null, image: canele, effects: [caneleEffect] },
  { id: 'whistle-candy', name: '휘파람 과자', price: 800, owner: null, image: whistleCandy, effects: [whistleCandyEffect] },
  { id: 'swimming', name: '수영', price: 900, owner: null, image: swimming, effects: [swimmingEffect] },
  { id: 'fallen-leaf', name: '낙엽', price: 1000, owner: null, image: fallenLeaf, effects: [fallenLeafUsagi, fallenLeafHachiware], isLong: true },
  { id: 'glowing-mushroom', name: '빛나는 버섯', price: 1100, owner: null, image: glowingMushroom, effects: [glowingMushroomEffect], isLong: true },
  { id: 'pajama', name: '파자마', price: 1200, owner: null, image: pajama, effects: [pajamaEffect] },
  { id: 'squid-suit', name: '오징어 옷', price: 1300, owner: null, image: squidSuit, effects: [squidSuitEffect] },
  { id: 'usagi-weapon', name: '우사기 무기', price: 1500, owner: null, image: usagiWeapon, effects: [usagiWeaponEffect], isLong: true },
  { id: 'camera', name: '카메라', price: 1600, owner: null, image: camera, effects: [cameraEffect] },
  { id: 'propeller', name: '프로펠러', price: 1700, owner: null, image: propeller, effects: [propellerEffect] },
  { id: 'guitar', name: '기타', price: 1800, owner: null, image: guitar, effects: [guitarEffect], isLong: true },
  { id: 'skull-staff', name: '해골 지팡이', price: 2100, owner: null, image: skullStaff, effects: [skullStaffEffect] },
]

export const shopItemsFor = (person: Person) => SHOP_ITEMS.filter(item => item.owner === null || item.owner === person)

// 예전 상점에서 산 물건(bought)은 보수가 모자라도 열린 것으로 친다.
export const unlockedItems = (items: ShopItem[], earned: number, bought: Set<string>) => items.filter(item => item.price <= earned || bought.has(item.id))

export const nextUnlock = (items: ShopItem[], earned: number, bought: Set<string>) => {
  const opened = new Set(unlockedItems(items, earned, bought).map(item => item.id))
  const next = items.filter(item => !opened.has(item.id)).sort((left, right) => left.price - right.price)[0]
  return next ? { item: next, left: next.price - earned } : null
}

const effectsOf = (items: ShopItem[], random: () => number) =>
  items.filter(item => item.effects.length > 0).map(item => item.effects[Math.floor(random() * item.effects.length)])

// 10장 효과 후보: 열린 물건마다 영상 하나씩(낙엽처럼 여럿이면 그중 하나). 긴 영상은 빠진다.
export const unlockedEffects = (items: ShopItem[], random: () => number = Math.random) => effectsOf(items.filter(item => !item.isLong), random)

// 오늘 목표를 채웠을 때 보여 줄 긴 영상 후보.
export const goalEffects = (items: ShopItem[], random: () => number = Math.random) => effectsOf(items.filter(item => item.isLong), random)
