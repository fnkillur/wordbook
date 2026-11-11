import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { saveSettings } from '../settings'
import ShopPage from './ShopPage'

let container: HTMLDivElement
let root: Root

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const itemCard = (name: string) => [...container.querySelectorAll('.shop-item')].find(item => item.textContent?.includes(name)) as HTMLElement
const earn = (amount: number) => db.coins.put({ id: 'make:test', kind: 'make', amount, at: new Date().toISOString() })

const open = async () => {
  await act(async () => root.render(<ShopPage />))
  await wait()
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  localStorage.clear()
  saveSettings({ person: '하치와레' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('도감', () => {
  it('모은 보수와 다음 물건까지 남은 보수를 보여 준다', async () => {
    await earn(250)
    await open()

    expect(container.querySelector('.page-title')?.textContent).toBe('도감')
    expect(container.querySelector('.shop-wallet')?.textContent).toContain('모은 보수')
    expect(container.querySelector('.shop-wallet')?.textContent).toContain('250')
    expect(container.querySelector('.shop-wallet')?.textContent).toContain('호빵까지 50')
    expect(container.querySelectorAll('.shop-item')).toHaveLength(18)
  })

  it('모은 보수만큼 물건이 열리고, 안 열린 물건은 그림자와 열리는 값을 보여 준다', async () => {
    await earn(250)
    await open()

    expect(itemCard('팬케이크').classList).not.toContain('is-locked')
    expect(itemCard('호빵').classList).toContain('is-locked')
    expect(itemCard('호빵').textContent).toContain('300이면 열려')
    expect(container.querySelector('.shop-item button')?.textContent).not.toContain('사기')
  })

  it('예전에 산 물건은 보수가 모자라도 열려 있다', async () => {
    await db.coins.put({ id: 'buy:guitar', kind: 'buy', amount: -900, at: new Date().toISOString() })
    await open()

    expect(itemCard('기타').classList).not.toContain('is-locked')
  })

  it('열린 물건을 누르면 효과 영상을 다시 보고, 누르면 닫힌다', async () => {
    await earn(1100)
    await open()

    await act(async () => (itemCard('빛나는 버섯').querySelector('button') as HTMLButtonElement).click())
    expect(container.querySelector('.effect-overlay video')?.getAttribute('src')).toContain('glowing-mushroom')
    await act(async () => (container.querySelector('.effect-overlay') as HTMLElement).click())
    expect(container.querySelector('.effect-overlay')).toBeNull()
  })

  it('안 열린 물건은 누를 수 없다', async () => {
    await earn(1500)
    await open()

    expect(itemCard('파자마').querySelector('button')).not.toBeNull()
    expect(itemCard('해골 지팡이').querySelector('button')).toBeNull()
  })
})
