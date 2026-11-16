import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import TabLayout from './TabLayout'

const renderAt = async (path: string) => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<TabLayout />}>
            <Route path="*" element={null} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
  )
  const labels = [...container.querySelectorAll('.tab-link')].map(link => link.textContent)
  const active = [...container.querySelectorAll('.tab-link.active')].map(link => link.textContent)
  root.unmount()
  return { labels, active }
}

describe('TabLayout', () => {
  it('안드로이드 앱은 오른손 엄지가 닿도록 집을 오른쪽 끝에 두어 설정·도감·책장·집 순서로 보여 준다', async () => {
    expect((await renderAt('/')).labels).toEqual(['설정', '도감', '책장', '집'])
  })

  it('지금 있는 탭에 선택 표시를 한다', async () => {
    expect((await renderAt('/')).active).toEqual(['집'])
    expect((await renderAt('/words')).active).toEqual(['책장'])
    expect((await renderAt('/settings')).active).toEqual(['설정'])
  })
})
