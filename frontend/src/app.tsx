import { Navigate, Route, Routes } from 'react-router-dom'

import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import ProjectDetails from './pages/ProjectDetails'
import DecisionMakers from './pages/DecisionMakers'
import SAWAnalysis from './pages/SAWAnalysis'
import AHPCriteriaMatrix from './pages/AHPCriteriaMatrix'
import WAMAggregation from './pages/WAMAggregation'

// ...





export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={<Dashboard />} />

      <Route
        path="/projects/:projectId"
        element={<ProjectDetails />}
      />
      <Route
  path="/projects/:projectId/decision-makers"
  element={<DecisionMakers />}
/>
<Route
  path="/projects/:projectId/wam-aggregation"
  element={<WAMAggregation />}
/>
<Route
  path="/projects/:projectId/ahp-matrix"
  element={<AHPCriteriaMatrix />}
/>
<Route
  path="/projects/:projectId/saw-analysis"
  element={<SAWAnalysis />}
/>
      <Route
        path="/"
        element={<Navigate to="/dashboard" replace />}
      />

      <Route
        path="*"
        element={<Navigate to="/dashboard" replace />}
      />
    </Routes>
  )
}