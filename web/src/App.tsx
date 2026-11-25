import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import EntityEdit from './pages/EntityEdit';
import EntityList from './pages/EntityList';
import Planner from './pages/Planner';
import StammdatenIndex from './pages/StammdatenIndex';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/stammdaten" replace />} />
        <Route path="/stammdaten" element={<StammdatenIndex />} />
        <Route path="/stammdaten/:entity" element={<EntityList />} />
        <Route path="/stammdaten/:entity/:id" element={<EntityEdit />} />
        <Route path="/planer" element={<Planner />} />
        <Route path="*" element={<Navigate to="/stammdaten" replace />} />
      </Routes>
    </div>
  );
}
