import { BookOpenTextIcon, GearSixIcon, HouseLineIcon, SparkleIcon, type Icon } from '@phosphor-icons/react'
import { NavLink, Outlet } from 'react-router'

function TabLayout() {
  return (
    <>
      <Outlet />
      <nav className="tab-bar" aria-label="주요 메뉴">
        <TabLink to="/" label="마을" icon={HouseLineIcon} end />
        <TabLink to="/words" label="단어장" icon={BookOpenTextIcon} />
        <TabLink to="/collection" label="도감" icon={SparkleIcon} />
        <TabLink to="/settings" label="설정" icon={GearSixIcon} />
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
