import { useState } from 'react';
import Sidebar, { type Page } from './components/Sidebar';
import InventoryPage from './pages/InventoryPage';
import TemplatePage from './pages/TemplatePage';
import './App.css';

export default function App() {
  const [page, setPage] = useState<Page>('inventory');

  return (
    <div className="app-layout">
      <Sidebar current={page} onChange={setPage} />
      <main className="app-main">
        {page === 'inventory' && <InventoryPage />}
        {page === 'template' && <TemplatePage />}
      </main>
    </div>
  );
}
