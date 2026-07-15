import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import WalletConnect from './components/WalletConnect';
import LandingPage from './pages/LandingPage';
import EmployerDashboard from './pages/EmployerDashboard';
import EmployeePanel from './pages/EmployeePanel';
import CompliancePanel from './pages/CompliancePanel';

const App: React.FC = () => {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const usesPrivateWorkspace = location.pathname === '/employer' || location.pathname === '/compliance';

  if (isLanding) {
    return <Routes><Route path="/" element={<LandingPage />} /></Routes>;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <header className="top-bar">
          <div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Midnight Network
            </span>
            {usesPrivateWorkspace && (
              <span
                className="badge badge-info"
                style={{ marginLeft: '0.75rem' }}
                title="This browser holds the access key for your private demo workspace."
              >
                Private demo workspace
              </span>
            )}
          </div>
          <WalletConnect />
        </header>
        <Routes>
          <Route path="/employer" element={<EmployerDashboard />} />
          <Route path="/employee" element={<EmployeePanel />} />
          <Route path="/compliance" element={<CompliancePanel />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
