import { BooksIcon, GearSixIcon, HouseLineIcon, SparkleIcon, type Icon } from '@phosphor-icons/react'
import { NavLink, Outlet } from 'react-router'
import { IS_WEB_BUILD } from '../platform'

const TABS: TabLinkProps[] = [
  { to: '/', label: '집', icon: HouseLineIcon, end: true },
  { to: '/words', label: '책장', icon: BooksIcon },
  { to: '/shop', label: '도감', icon: SparkleIcon },
  { to: '/settings', label: '설정', icon: GearSixIcon },
]

// 폴드를 펼치면 화면이 넓어 왼쪽 끝이 엄지에 닿지 않아서, 안드로이드 앱은 자주 가는 집을 오른쪽 끝에 둔다.
const ORDERED_TABS = IS_WEB_BUILD ? TABS : [...TABS].reverse()

function TabLayout() {
  return (
    <>
      <Outlet />
      <nav className="tab-bar" aria-label="주요 메뉴">
        {ORDERED_TABS.map(tab => (
          <TabLink key={tab.to} {...tab} />
        ))}
      </nav>
    </>
  )
}

type TabLinkProps = { to: string; label: string; icon: Icon; end?: boolean }

// 탭 이동은 이력에 쌓지 않는다.
function TabLink({ to, label, icon: TabIcon, end }: TabLinkProps) {
  return (
    <NavLink to={to} end={end} replace className={({ isActive }) => `tab-link${isActive ? ' active' : ''}`}>
      {({ isActive }) => (
        <>
          <TabIcon size={24} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default TabLayout
