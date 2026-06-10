import React, { useState } from 'react';
import Navbar from './components/Navbar';
import RequestPage from './components/RequestPage';
import StatusKanban from './components/StatusKanban';
import AdminPanel from './components/AdminPanel';

function App() {
  const [activeTab, setActiveTab] = useState('request');

  const renderContent = () => {
    switch (activeTab) {
      case 'request':
        return <RequestPage />;
      case 'kanban':
        return <StatusKanban />;
      case 'admin':
        return <AdminPanel />;
      default:
        return <RequestPage />;
    }
  };

  return (
    <div className="app-container">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
