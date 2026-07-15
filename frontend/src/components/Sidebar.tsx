import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Shield,
  BarChart3,
  Upload,
  Clock,
  Key,
  FileCheck,
  Users,
  ArrowLeft,
} from 'lucide-react';

interface NavEntry {
  label: string;
  icon: React.ReactNode;
  to: string;
  hash?: string;
}

const NAV_MAP: Record<string, { sectionLabel: string; items: NavEntry[] }> = {
  employer: {
    sectionLabel: 'Employer Portal',
    items: [
      { label: 'Dashboard', icon: <BarChart3 size={16} />, to: '/employer' },
      { label: 'Upload Roster', icon: <Upload size={16} />, to: '/employer', hash: 'upload' },
      { label: 'Payroll History', icon: <Clock size={16} />, to: '/employer', hash: 'history' },
    ],
  },
  employee: {
    sectionLabel: 'Employee Portal',
    items: [
      { label: 'Claim Salary', icon: <Key size={16} />, to: '/employee' },
      { label: 'How It Works', icon: <Clock size={16} />, to: '/employee', hash: 'how-it-works' },
    ],
  },
  compliance: {
    sectionLabel: 'Compliance Auditor',
    items: [
      { label: 'Overview', icon: <FileCheck size={16} />, to: '/compliance' },
      { label: 'Allow/Block Lists', icon: <Users size={16} />, to: '/compliance', hash: 'lists' },
      { label: 'Audit Log', icon: <Clock size={16} />, to: '/compliance', hash: 'audit' },
    ],
  },
};

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const role = location.pathname.split('/')[1] || 'employer';
  const config = NAV_MAP[role] || NAV_MAP.employer;

  const scrollToHash = (hash: string) => {
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleClick = (item: NavEntry) => {
    if (item.hash) {
      if (location.pathname === item.to) {
        // Already on page — scroll immediately
        scrollToHash(item.hash);
      } else {
        // Navigate first, then scroll after React renders
        navigate(item.to);
        setTimeout(() => scrollToHash(item.hash!), 300);
      }
    } else {
      navigate(item.to);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <NavLink to="/" className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Shield size={18} />
        </div>
        <div>
          <div className="sidebar-brand-text">VeilPay</div>
          <div className="sidebar-brand-sub">Midnight Network</div>
        </div>
      </NavLink>

      {/* Section label */}
      <div className="sidebar-section-label">{config.sectionLabel}</div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {config.items.map((item, idx) => (
          <button
            key={item.label}
            className={`nav-item${idx === 0 ? ' active' : ''}`}
            onClick={() => handleClick(item)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/')}>
          <ArrowLeft size={14} />
          Switch Portal
        </button>
        <span style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Midnight demo build
        </span>
      </div>
    </aside>
  );
};

export default Sidebar;
