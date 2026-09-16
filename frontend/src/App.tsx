import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import ProjectDetails from './pages/ProjectDetails';
import CriteriaSelection from './pages/CriteriaSelection';
import DecisionMakers from './pages/DecisionMakers';
import AHPMatrice from './pages/AHPMatrice';
import WAMAggregation from './pages/WAMAggregation';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects/:projectId" element={<ProjectDetails />} />
        <Route path="/projects/:projectId/criteria" element={<CriteriaSelection />} />
        <Route path="/decision-makers" element={<DecisionMakers />} />
        <Route path="/ahp-matrix" element={<AHPMatrice />} />
        <Route path="/wam-aggregation" element={<WAMAggregation />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
