import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, EligibilityResult, WAMResult } from '../services/api'
import { supabase } from '../services/supabase'

interface ExpertData {
  expert_id: string
  expert_name: string
  comparison_run_id: string
  criteria_count: number
  consistency_ratio: number
  saved_at: string
}

export default function WAMAggregation() {
  const { projectId } = useParams<{ projectId: string }>()
  const [params] = useSearchParams()
  const datasetId = params.get('datasetId')
  const [experts, setExperts] = useState<ExpertData[]>([])
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null)
  const [result, setResult] = useState<WAMResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [runningEligibility, setRunningEligibility] = useState(false)
  const [runningWAM, setRunningWAM] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!datasetId) {
      setError('Dataset ID is missing.')
      setLoading(false)
      return
    }

    try {
      const loaded: ExpertData[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith(`ahp_matrix_${datasetId}_`)) continue
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const p = JSON.parse(raw)
        if (p.comparisonRunId && p.weights?.length === 7 && p.consistencyRatio <= 0.1) {
          loaded.push({
            expert_id: key.replace(`ahp_matrix_${datasetId}_`, ''),
            expert_name: p.expertName || 'Expert',
            comparison_run_id: p.comparisonRunId,
            criteria_count: p.weights.length,
            consistency_ratio: p.consistencyRatio,
            saved_at: p.savedAt || '',
          })
        }
      }
      setExperts(loaded)
      if (!loaded.length) {
        setError('No valid expert AHP run found. Complete and save AHP for each expert with CR ≤ 0.10 first.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load expert AHP data.')
    } finally {
      setLoading(false)
    }
  }, [datasetId])

  async function runEligibility() {
    if (!datasetId || !projectId) return
    setRunningEligibility(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.runEligibility(projectId, datasetId)
      setEligibility(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eligibility analysis failed.')
    } finally {
      setRunningEligibility(false)
    }
  }

  async function runWAM() {
    if (!datasetId || !projectId || !experts.length) return
    setRunningWAM(true)
    setError(null)
    try {
      const eligibilityResult = eligibility ?? await api.runEligibility(projectId, datasetId)
      setEligibility(eligibilityResult)

      const data = await api.executeWAM(
        projectId,
        datasetId,
        eligibilityResult.analysis_run_id,
        experts.map(e => ({
          expert_id: e.expert_id,
          expert_name: e.expert_name,
          consistency_ratio: e.consistency_ratio,
          comparison_run_id: e.comparison_run_id,
        })),
      )
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WAM execution failed.')
    } finally {
      setRunningWAM(false)
    }
  }

  function exportCSV() {
    if (!result) return
    const rows = [
      ['Rank', 'Zone ID', 'Zone Name', 'Final WAM Score'],
      ...result.rankings.map(r => [String(r.rank), r.zone_id, r.zone_name || '', Number(r.final_score).toFixed(6)]),
    ]
    const csv = rows.map(row => row.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `wam_ranking_${datasetId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><p>Loading analysis data…</p></main>

  return (
    <main className="max-w-7xl mx-auto p-8">
      <Link to={`/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`} className="text-blue-600 hover:underline">← Back to decision makers</Link>

      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">WAM — Expert Scores & Final Ranking</h1>
            <p className="mt-2 text-gray-600">AHP weights are applied independently for each expert. The final score is the arithmetic mean across experts.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">AHP → WAM → Average</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 mt-5">
          <div className="rounded-lg border p-4"><div className="text-sm text-gray-500">Valid experts</div><div className="text-2xl font-bold">{experts.length}</div></div>
          <div className="rounded-lg border p-4"><div className="text-sm text-gray-500">Criteria</div><div className="text-2xl font-bold">7</div></div>
          <div className="rounded-lg border p-4"><div className="text-sm text-gray-500">Expert weighting</div><div className="text-2xl font-bold">Equal</div></div>
        </div>
      </section>

      {error && <div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">1. Eligibility / Filtering</h2>
            <p className="mt-1 text-sm text-gray-600">Run the eligibility rules first. Only eligible zones are passed to WAM.</p>
          </div>
          <button onClick={runEligibility} disabled={runningEligibility || runningWAM || !datasetId} className="px-5 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400">
            {runningEligibility ? 'Running filtering…' : 'Run eligibility'}
          </button>
        </div>
        {eligibility && (
          <div className="grid gap-3 sm:grid-cols-3 mt-5">
            <div className="rounded-lg border p-4"><div className="text-sm text-gray-500">Total zones</div><div className="text-2xl font-bold">{eligibility.total_zones}</div></div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4"><div className="text-sm text-green-700">Eligible</div><div className="text-2xl font-bold text-green-800">{eligibility.eligible_zones}</div></div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4"><div className="text-sm text-red-700">Excluded</div><div className="text-2xl font-bold text-red-800">{eligibility.excluded_zones}</div></div>
          </div>
        )}
      </section>

      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold">2. Valid AHP experts</h2>
        <p className="mt-1 text-sm text-gray-600">Only persisted AHP runs with 7 criteria and CR ≤ 0.10 are accepted.</p>
        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border">
            <thead><tr className="bg-gray-100"><th className="border p-2 text-left">Expert</th><th className="border p-2">CR</th><th className="border p-2">Criteria</th><th className="border p-2">AHP Run</th></tr></thead>
            <tbody>{experts.map(e => <tr key={e.expert_id}><td className="border p-2">{e.expert_name}</td><td className="border p-2 text-center">{e.consistency_ratio.toFixed(4)}</td><td className="border p-2 text-center">{e.criteria_count}</td><td className="border p-2 text-center font-mono">{e.comparison_run_id.slice(0, 8)}…</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">3. WAM & Final Ranking</h2>
            <p className="mt-1 text-sm text-gray-600">WAM is executed with the eligibility run ID, then expert scores are averaged.</p>
          </div>
          <button onClick={runWAM} disabled={runningWAM || runningEligibility || !experts.length} className="px-5 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400">
            {runningWAM ? 'Calculating WAM…' : 'Run WAM & Final Ranking'}
          </button>
        </div>
        {eligibility && <p className="mt-3 text-xs text-gray-500">Eligibility run: <span className="font-mono">{eligibility.analysis_run_id}</span></p>}
      </section>

      {result && (
        <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-xl font-semibold">Final Ranking</h2><p className="mt-1 text-sm text-gray-600">Final score = arithmetic mean of the independent expert WAM scores.</p></div>
            <button onClick={exportCSV} className="px-4 py-2 border rounded">Export CSV</button>
          </div>
          <p className="mt-2 text-xs text-gray-500">Analysis Run: <span className="font-mono">{result.analysis_run_id}</span></p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse border">
              <thead><tr className="bg-gray-100"><th className="border p-2">Rank</th><th className="border p-2 text-left">Zone</th><th className="border p-2">Final Score</th></tr></thead>
              <tbody>{result.rankings.map(r => <tr key={r.zone_id}><td className="border p-2 text-center font-semibold">{r.rank}</td><td className="border p-2">{r.zone_name ? `${r.zone_name} (${r.zone_id})` : r.zone_id}</td><td className="border p-2 text-center font-mono">{Number(r.final_score).toFixed(6)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
