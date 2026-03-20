import './Sidebar.css';

export type Page = 'inventory' | 'template';

interface Props {
  current: Page;
  onChange: (page: Page) => void;
}

const NAV_ITEMS: { id: Page; icon: string; label: string; sub: string }[] = [
  { id: 'inventory', icon: '🧪', label: '인벤토리', sub: '시약·샘플·장비' },
  { id: 'template', icon: '📋', label: '템플릿', sub: '실험법·SOP' },
];

export default function Sidebar({ current, onChange }: Props) {
  return (
    <aside className="sidebar">
      {/* 로고 */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">⚗️</span>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-title">LabNote</span>
          <span className="sidebar-logo-sub">ELN Platform</span>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="sidebar-nav">
        <span className="sidebar-section-label">메뉴</span>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${current === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <div className="sidebar-nav-text">
              <span className="sidebar-nav-label">{item.label}</span>
              <span className="sidebar-nav-sub">{item.sub}</span>
            </div>
            {current === item.id && <span className="sidebar-nav-dot" />}
          </button>
        ))}
      </nav>

      {/* 하단 정보 */}
      <div className="sidebar-footer">
        <span className="sidebar-footer-text">Phase 1 Backend Infra</span>
      </div>
    </aside>
  );
}
