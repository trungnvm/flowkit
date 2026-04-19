import { BrowserRouter, NavLink, Routes, Route, useLocation } from 'react-router-dom'
import { LayoutDashboard, FolderOpen, ScrollText, Film, Languages } from 'lucide-react'
import { useWebSocket } from './api/useWebSocket'
import DashboardPage from './pages/DashboardPage'
import ProjectsPage from './pages/ProjectsPage'
import LogsPage from './pages/LogsPage'
import GalleryPage from './pages/GalleryPage'
import { useI18n } from './language-toggle-and-bilingual-ui-context'

function Layout() {
  const { isConnected } = useWebSocket()
  const { language, toggleLanguage, t } = useI18n()

  const nav = [
    { to: '/', icon: LayoutDashboard, label: t('Bảng điều khiển', 'Dashboard'), exact: true },
    { to: '/projects', icon: FolderOpen, label: t('Dự án', 'Projects'), exact: false },
    { to: '/logs', icon: ScrollText, label: t('Nhật ký', 'Logs'), exact: false },
    { to: '/gallery', icon: Film, label: t('Thư viện', 'Gallery'), exact: false },
  ]

  const loc = useLocation()
  const match = nav.find(n => n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to))

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Left sidebar */}
      <aside className="w-48 flex-shrink-0 flex flex-col border-r" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="px-4 py-4 text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          Flow Kit
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {nav.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                  isActive
                    ? 'font-semibold'
                    : 'hover:opacity-80'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--card)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--muted)',
              })}
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top header */}
        <header className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {match?.label ?? t('Bảng điều khiển', 'Dashboard')}
          </span>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-2 py-1 rounded"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}
              title={t('Đổi ngôn ngữ', 'Switch language')}
            >
              <Languages size={12} /> {language.toUpperCase()}
            </button>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: isConnected ? 'var(--green)' : 'var(--red)' }}
              />
              {isConnected ? t('WS đã kết nối', 'WS connected') : t('WS ngắt kết nối', 'WS disconnected')}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-5">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
