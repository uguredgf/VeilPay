import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, BarChart3, Wallet, FileCheck, ArrowRight, Check } from 'lucide-react';

const MARQUEE_ITEMS = [
  'Midnight Network',
  'Zero-Knowledge Proofs',
  'Selective Disclosure',
  'Compact DSL',
  'Shielded Treasury',
  'Halo2 Circuits',
  'Private Payroll',
  'DUST Gas Token',
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [reversed, setReversed] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const currentY = window.scrollY;
      setReversed(currentY < lastY);
      lastY = currentY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing-page">
      {/* ── Nav ── */}
      <nav className="landing-nav">
        <div className="sidebar-brand" style={{ padding: 0, border: 'none' }}>
          <div className="sidebar-brand-icon"><Shield size={18} /></div>
          <span className="sidebar-brand-text">VeilPay</span>
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#enter">Get started</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero" id="features">
        <h1 className="landing-title">
          Private payroll on a{'\n'}
          <span style={{ color: 'var(--accent)' }}>public ledger.</span>
        </h1>
        <p className="landing-subtitle">
          Run payroll with zero-knowledge proofs on Midnight Network. Employees claim salaries privately while regulators verify compliance without seeing amounts.
        </p>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {['Selective disclosure', 'Regulatory compliant', 'One-time claim secrets'].map((item) => (
            <span key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              <Check size={14} /> {item}
            </span>
          ))}
        </div>
      </section>

      {/* ── Marquee ── */}
      <div className={`marquee${reversed ? ' marquee--reverse' : ''}`} ref={marqueeRef}>
        {[0, 1, 2, 3].map((copy) => (
          <div className="marquee__content" key={copy} aria-hidden={copy > 0}>
            {MARQUEE_ITEMS.map((item, i) => (
              <React.Fragment key={i}>
                <span>{item}</span>
                <span className="dot" />
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>

      {/* ── Role selection ── */}
      <section id="enter" style={{ padding: '5rem 2rem', maxWidth: '960px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2.5rem', textAlign: 'center' }}>
          Choose your portal
        </h2>
        <p className="demo-privacy-note">
          Employer and auditor data are isolated in a private workspace created for this browser.
          Keep using the same browser; clearing site data starts a new empty workspace. Employee
          access remains protected by a one-time claim key.
        </p>
        <div className="role-cards">
          {[
            {
              icon: <BarChart3 size={24} />,
              title: 'Employer',
              desc: 'Upload payroll rosters and issue claim keys to employees.',
              path: '/employer',
            },
            {
              icon: <Wallet size={24} />,
              title: 'Employee',
              desc: 'Claim your salary privately using a one-time secret key.',
              path: '/employee',
            },
            {
              icon: <FileCheck size={24} />,
              title: 'Compliance Auditor',
              desc: 'Verify payroll compliance without accessing salary details.',
              path: '/compliance',
            },
          ].map((role) => (
            <div className="role-card" key={role.title} onClick={() => navigate(role.path)} style={{ cursor: 'pointer' }}>
              <div className="role-card-icon" style={{ color: 'var(--accent)' }}>{role.icon}</div>
              <div className="role-card-title">{role.title}</div>
              <div className="role-card-desc">{role.desc}</div>
              <span className="role-card-link">
                Enter <ArrowRight size={14} />
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" style={{ padding: '4rem 2rem', maxWidth: '960px', margin: '0 auto' }}>
        <div className="how-it-works">
          {[
            { num: '01', title: 'Upload CSV', desc: 'Employer uploads an encrypted payroll roster.' },
            { num: '02', title: 'Issue claim keys', desc: 'Unique one-time secrets are generated per employee.' },
            { num: '03', title: 'Employee claims', desc: 'Employee submits their key to claim shielded funds.' },
            { num: '04', title: 'Auditor verifies', desc: 'Compliance checks pass without revealing amounts.' },
          ].map((step) => (
            <div className="how-step" key={step.num}>
              <div className="how-step-num">{step.num}</div>
              <div className="how-step-title">{step.title}</div>
              <div className="how-step-desc">{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        VeilPay &middot; Built on Midnight Network
      </footer>
    </div>
  );
};

export default LandingPage;
