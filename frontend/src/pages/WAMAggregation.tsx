import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabase'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'
interface ExpertData { expert_id: string; expert_name: string; comparison_run_id: string; criteria_count: number; consistency_ratio: number; saved_at: string }
interface Ranking { zone_id: string; zone_name: string | null; final_score: string; rank: number }
interface ResponseData { analysis_run_id: string; experts_count: number; criteria_count: number; rankings: Ranking[] }

export default function WAMAggregation() {
  const { projectId } = useParams<{ projectId: string }>(); const [params] = useSearchParams(); const datasetId = params.get('datasetId')
  const [experts, setExperts] = useState<ExpertData[]>([]); const [result, setResult] = useState<ResponseData | null>(null); const [loading, setLoading] = useState(true); const [running, setRunning] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!datasetId) { setError('Dataset ID is missing.'); setLoading(false); return }
    try {
      const loaded: ExpertData[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith(`ahp_matrix_${datasetId}_`)) continue
        const raw = localStorage.getItem(key); if (!raw) continue
        const p = JSON.parse(raw)
        if (p.comparisonRunId && p.weights?.length === 7 && p.consistencyRatio <= 0.1) {
          loaded.push({ expert_id: key.replace(`ahp_matrix_${datasetId}_`, ''), expert_name: p.expertName || 'Expert', comparison_run_id: p.comparisonRunId, criteria_count: p.weights.length, consistency_ratio: p.consistencyRatio, saved_at: p.savedAt || '' })
        }
      }
      setExperts(loaded)
      if (!loaded.length) setError('No expert has a persisted valid AHP comparison (CR ≤ 0.10). Complete and save AHP for each expert first.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load expert AHP data.') }
    finally { setLoading(false) }
  }, [datasetId])

  async function runWAM() {
    if (!datasetId || !projectId || !experts.length) return
    setRunning(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('You must sign in before running the analysis.')
      const response = await fetch(`${API_BASE_URL}/wam/execute`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ project_id: projectId, processed_dataset_id: datasetId, experts: experts.map(e => ({ expert_id: e.expert_id, expert_name: e.expert_name, consistency_ratio: e.consistency_ratio, comparison_run_id: e.comparison_run_id })) }) })
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`); setResult(body)
    } catch (e) { setError(e instanceof Error ? e.message : 'WAM execution failed.') }
    finally { setRunning(false) }
  }

  function exportCSV() { if (!result) return; const rows = [['Rank', 'Zone ID', 'Zone Name', 'Final WAM Score'], ...result.rankings.map(r => [String(r.rank), r.zone_id, r.zone_name || '', Number(r.final_score).toFixed(6)])]; const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `wam_ranking_${datasetId}.csv`; a.click(); URL.revokeObjectURL(url) }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><p>Loading experts…</p></main>
  return <main className="max-w-7xl mx-auto p-8">
    <Link to={`/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`} className="text-blue-600 hover:underline">← Back to decision makers</Link>
    <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm"><h1 className="text-2xl font-bold">WAM — Per-Expert Scores & Final Ranking</h1><p className="mt-2 text-gray-600">Each expert's persisted AHP weights are used independently in WAM. The final score is the simple arithmetic mean across experts.</p><div className="mt-3 text-sm text-gray-600">Experts: <strong>{experts.length}</strong> · Criteria: <strong>7</strong> · Expert weighting: <strong>equal</strong></div></section>
    {error && <div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm"><h2 className="text-xl font-semibold">Persisted AHP validation</h2><table className="w-full mt-4 border-collapse border"><thead><tr className="bg-gray-100"><th className="border p-2 text-left">Expert</th><th className="border p-2">CR</th><th className="border p-2">Criteria</th><th className="border p-2">AHP Run</th></tr></thead><tbody>{experts.map(e => <tr key={e.expert_id}><td className="border p-2">{e.expert_name}</td><td className="border p-2 text-center">{e.consistency_ratio.toFixed(4)}</td><td className="border p-2 text-center">{e.criteria_count}</td><td className="border p-2 text-center font-mono">{e.comparison_run_id.slice(0, 8)}…</td></tr>)}</tbody></table><button onClick={runWAM} disabled={running || !experts.length} className="mt-5 px-5 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400">{running ? 'Calculating WAM…' : 'Run WAM & Final Ranking'}</button></section>
    {result && <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Final Ranking</h2><button onClick={exportCSV} className="px-4 py-2 border rounded">Export CSV</button></div><p className="mt-2 text-sm text-gray-600">Final score = average of the independent WAM scores of all experts.</p><p className="mt-1 text-xs text-gray-500">Analysis Run: <span className="font-mono">{result.analysis_run_id}</span> · Expert WAM scores and criterion contributions are persisted.</p><div className="overflow-x-auto mt-4"><table className="w-full border-collapse border"><thead><tr className="bg-gray-100"><th className="border p-2">Rank</th><th className="border p-2 text-left">Zone</th><th className="border p-2">Final Score</th></tr></thead><tbody>{result.rankings.map(r => <tr key={r.zone_id}><td className="border p-2 text-center">{r.rank}</td><td className="border p-2">{r.zone_name ? `${r.zone_name} (${r.zone_id})` : r.zone_id}</td><td className="border p-2 text-center font-mono">{Number(r.final_score).toFixed(6)}</td></tr>)}</tbody></table></div></section>}
  </main>
}
