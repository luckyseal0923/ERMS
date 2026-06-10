import React from 'react';
import { Layers, Calendar, ShieldAlert, Award } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={() => setActiveTab('request')}>
        <Award size={28} className="text-primary" style={{ color: 'var(--primary)' }} />
        <span>教學資源管理系統 <small style={{ fontSize: '0.65em', fontWeight: 500, color: 'var(--text-secondary)' }}>ERMS</small></span>
      </div>
      <div className="nav-links">
        <button
          className={`nav-link ${activeTab === 'request' ? 'active' : ''}`}
          onClick={() => setActiveTab('request')}
        >
          <Layers size={18} />
          租借申請
        </button>
        <button
          className={`nav-link ${activeTab === 'kanban' ? 'active' : ''}`}
          onClick={() => setActiveTab('kanban')}
        >
          <Calendar size={18} />
          租借狀態看板
        </button>
        <button
          className={`nav-link ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => setActiveTab('admin')}
        >
          <ShieldAlert size={18} />
          後台管理
        </button>
      </div>
    </nav>
  );
}
