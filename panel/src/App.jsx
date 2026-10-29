import { Routes, Route } from 'react-router-dom';
import BottomNav from './components/BottomNav.jsx';
import UsersPage from './pages/UsersPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import DeviceLayout from './pages/DeviceLayout.jsx';
import OverviewTab from './pages/device/OverviewTab.jsx';
import AppsTab from './pages/device/AppsTab.jsx';
import ActionsTab from './pages/device/ActionsTab.jsx';

export default function App() {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-bg font-sans text-ink shadow-e2">
      <main className="no-scrollbar flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<UsersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/devices/:id" element={<DeviceLayout />}>
            <Route index element={<OverviewTab />} />
            <Route path="apps" element={<AppsTab />} />
            <Route path="actions" element={<ActionsTab />} />
          </Route>
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
