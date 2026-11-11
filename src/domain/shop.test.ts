import { describe, expect, it } from 'vitest'
import { goalEffects, nextUnlock, shopItemsFor, unlockedEffects, unlockedItems } from './shop'

describe('shop', () => {
  it('애니 1화부터 나온 먹거리·놀이가 먼저 열리고, 원래 물건이 뒤를 잇는다', () => {
    const items = shopItemsFor('하치와레')
    expect(items.map(item => item.name)).toEqual([
      '푸딩',
      '팬케이크',
      '호빵',
      '요구르트',
      '젤리 사이다',
      '마시멜로',
      '까눌레',
      '휘파람 과자',
      '수영',
      '낙엽',
      '빛나는 버섯',
      '파자마',
      '오징어 옷',
      '우사기 무기',
      '카메라',
      '프로펠러',
      '기타',
      '해골 지팡이',
    ])
    expect(items.map(item => item.price)).toEqual([...items.map(item => item.price)].sort((left, right) => left - right))
    expect(items.every(item => item.image)).toBe(true)
  })

  it('지금 물건은 모두 공통이라 우사기에게도 똑같이 보인다', () => {
    expect(shopItemsFor('우사기')).toEqual(shopItemsFor('하치와레'))
  })
})

describe('도감', () => {
  const items = shopItemsFor('우사기')

  it('모은 보수가 값 이상이거나 예전에 산 물건이 열린다', () => {
    expect(unlockedItems(items, 250, new Set()).map(item => item.id)).toEqual(['pudding', 'pancake'])
    expect(unlockedItems(items, 0, new Set(['guitar'])).map(item => item.id)).toEqual(['guitar'])
  })

  it('다음 물건은 아직 안 열린 것 중 가장 싼 것이고, 남은 보수를 알려 준다', () => {
    expect(nextUnlock(items, 250, new Set())).toMatchObject({ item: { id: 'steamed-bun' }, left: 50 })
    expect(nextUnlock(items, 5000, new Set())).toBeNull()
  })

  it('낙엽·푸딩·젤리 사이다는 효과 영상이 둘이고, 모든 물건에 효과 영상이 있다', () => {
    expect(['fallen-leaf', 'pudding', 'jelly-cider'].map(id => items.find(item => item.id === id)?.effects.length)).toEqual([2, 2, 2])
    expect(items.every(item => item.effects.length > 0)).toBe(true)
  })

  it('효과 후보는 열린 물건마다 영상 하나씩이고, 영상이 둘인 낙엽은 그중 하나를 고른다', () => {
    const fallenLeaf = items.filter(item => item.id === 'fallen-leaf')
    expect(goalEffects(fallenLeaf, () => 0)[0]).toContain('fallen-leaf-usagi')
    expect(goalEffects(fallenLeaf, () => 0.99)[0]).toContain('fallen-leaf-hachiware')
    expect(unlockedEffects(unlockedItems(items, 300, new Set()), () => 0)).toHaveLength(3)
  })
})

describe('긴 효과', () => {
  const items = shopItemsFor('우사기')

  it('낙엽·빛나는 버섯·우사기 무기·기타는 10장 효과에서 빠지고 오늘 목표 달성에만 나온다', () => {
    const opened = unlockedItems(items, 5000, new Set())
    const long = /fallen-leaf|glowing-mushroom|usagi-weapon|guitar/
    expect(unlockedEffects(opened, () => 0).some(effect => long.test(effect))).toBe(false)
    expect(goalEffects(opened, () => 0).map(effect => effect.match(long)?.[0])).toEqual(['fallen-leaf', 'glowing-mushroom', 'usagi-weapon', 'guitar'])
    expect(goalEffects(unlockedItems(items, 100, new Set()), () => 0)).toEqual([])
  })
})

