/**
 * @file      App.tsx – Routing der App (alle Seiten-URLs) + Login-Schutz
 * @layer     Web · App-Rahmen
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import { useAuth } from './core/auth';
import Login from './pages/Login';
import EntityEdit from './pages/EntityEdit';
import EntityList from './pages/EntityList';
import Hilfe from './pages/Hilfe';
import Planner from './pages/Planner';
import StammdatenIndex from './pages/StammdatenIndex';

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/stammdaten" replace />} />
        <Route path="/stammdaten" element={<StammdatenIndex />} />
        <Route path="/stammdaten/:entity" element={<EntityList />} />
        <Route path="/stammdaten/:entity/:id" element={<EntityEdit />} />
        <Route path="/planer" element={<Planner />} />
        <Route path="/hilfe" element={<Hilfe />} />
        <Route path="*" element={<Navigate to="/stammdaten" replace />} />
      </Routes>
    </div>
  );
}
