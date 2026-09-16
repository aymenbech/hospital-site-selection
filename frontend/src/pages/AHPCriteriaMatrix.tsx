import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, CriterionPayload } from '../services/api'
import { supabase } from '../services/supabase'

interface ComparisonMatrix { [rowId: string]: { [columnId: string]: number } }
interface Weight { criterion_id: string; criterion_name: string; weight: number }
interface AHPResponse {
  comparison_run_id: string
  project_id: string
  analysis_run_id: string | null
  weights: Array<{ criterion_id: string; criterion_code: string; criterion_name: string; weight: number | string }>
  lambda_max: number
  consistency_index: number
  random_index: number
  consistency_ratio: number
  is_consistent: boolean
}

const SAATY_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export default function AHPCriteriaMatrix() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const datasetId = searchParams.get('datasetId')
  const expertId = searchParams.get('expertId')
  const [criteria, setCriteria] = useState<CriterionPayload[]>([])
  const [expertName, setExpertName] = useState('')
  const [matrix, setMatrix] = useState<ComparisonMatrix>({})
  const [weights, setWeights] = useState<Weight[]>([])
  const [lambdaMax, setLambdaMax] = useState<number | null>(null)
  const [ci, setCi] = useState<number | null>(null)
  const [cr, setCr] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      if (!projectId || !datasetId) {
        setError('Project or dataset is missing from the URL.')
        setLoading(false)
        return
      }
      try {
        // The database is the source of truth for the active criteria.
        const dbCriteria = await api.getActiveCriteria(projectId)
        if (dbCriteria.length !== 7) throw new Error(`The final methodology requires exactly 7 active criteria. Found: ${dbCriteria.length}.`)
        setCriteria(dbCriteria)

        const saved = expertId ? localStorage.getItem(`ahp_matrix_${datasetId}_${expertId}`) : null
        if (saved) {
          const parsed = JSON.parse(saved) as { matrix?: ComparisonMatrix; expertName?: string }
          if (parsed.matrix) setMatrix(parsed.matrix)
          if (parsed.expertName) setExpertName(parsed.expertName)
        } else {
          const initial: ComparisonMatrix = {}
          dbCriteria.forEach(row => {
            initial[row.id!] = {}
            dbCriteria.forEach(col => { initial[row.id!][col.id!] = 1 })
          })
          setMatrix(initial)
        }
        setExpertName(prev => prev || (expertId ? `Expert ${expertId.slice(0, 8)}` : 'Decision maker'))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load the active criteria from the database.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [projectId, datasetId, expertId])

  useEffect(() => {
    if (criteria.length !== 7 || Object.keys(matrix).length !== 7) {
      setCr(null); setCi(null); setLambdaMax(null); setWeights([]); return
    }
    const ids = criteria.map(c => c.id!)
    const n = 7
    const columnSums = ids.map(col => ids.reduce((s, row) => s + (matrix[row]?.[col] ?? 1), 0))
    const priority = ids.map((row) => ids.reduce((s, col, i) => s + (matrix[row]?.[col] ?? 1) / columnSums[i], 0) / n)
    const total = priority.reduce((s, v) => s + v, 0)
    const normalizedWeights = priority.map(v => v / total)
    const weighted = ids.map(row => ids.reduce((s, col, i) => s + (matrix[row]?.[col] ?? 1) * normalizedWeights[i], 0))
    const lambda = weighted.reduce((s, x, i) => s + x / normalizedWeights[i], 0) / n
    const consistencyIndex = (lambda - n) / 6
    const ratio = consistencyIndex / 1.32
    setLambdaMax(lambda)
    setCi(consistencyIndex)
    setCr(ratio)
    setWeights(ids.map((id, i) => ({ criterion_id: id, criterion_name: `${criteria[i].name} (${criteria[i].code})`, weight: normalizedWeights[i] })))
  }, [criteria, matrix])

  function handleComparisonChange(rowId: string, colId: string, value: number) {
    if (!Number.isFinite(value) || value <= 0) return
    setMatrix(current => ({
      ...current,
      [rowId]: { ...current[rowId], [colId]: value },
      [colId]: { ...current[colId], [rowId]: 1 / value },
    }))
  }

  async function handleSave() {
    if (!projectId || !datasetId || !expertId) { setError('Project, dataset and decision maker IDs are required.'); return }
    if (criteria.length !== 7 || cr === null || cr > 0.10) {
      setError(`Exactly 7 criteria and CR ≤ 0.10 are required. Current CR: ${cr?.toFixed(4) ?? 'N/A'}`)
      return
    }
    const comparisons = []
    for (let i = 0; i < criteria.length; i++) {
      for (let j = i + 1; j < criteria.length; j++) {
        comparisons.push({ criterion_i_id: criteria[i].id, criterion_j_id: criteria[j].id, scale_value: matrix[criteria[i].id!]?.[criteria[j].id!] ?? 1 })
      }
    }
    if (comparisons.length !== 21) { setError('AHP requires exactly 21 unique pairwise comparisons.'); return }

    setSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('You must sign in before saving AHP.')
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'}/ahp/runs`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          project_id: projectId,
          analysis_run_id: null,
          name: `${expertName} — AHP`,
          description: `AHP criteria weights for decision maker ${expertId}`,
          comparisons,
        }),
      })
      const body = await response.json() as AHPResponse | { detail?: string }
      if (!response.ok) throw new Error(('detail' in body && body.detail) || `AHP save failed (${response.status})`)
      const saved = body as AHPResponse

      // Persist exactly the backend values so the UI/WAM never relies on a separately computed CR or weights.
      localStorage.setItem(`ahp_matrix_${datasetId}_${expertId}`, JSON.stringify({
        comparisonRunId: saved.comparison_run_id,
        decisionMakerId: expertId,
        criteria,
        matrix,
        weights: saved.weights.map(w => ({ criterion_id: w.criterion_id, criterion_name: `${w.criterion_name} (${w.criterion_code})`, weight: Number(w.weight) })),
        lambdaMax: saved.lambda_max,
        consistencyIndex: saved.consistency_index,
        randomIndex: saved.random_index,
        consistencyRatio: saved.consistency_ratio,
        isConsistent: saved.is_consistent,
        expertName,
        savedAt: new Date().toISOString(),
      }))
      navigate(`/projects/${projectId}/decision-makers?datasetId=${datasetId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save the AHP comparison matrix.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center"><p>Loading AHP matrix...</p></main>
  if (error && criteria.length === 0) return <main className="mx-auto max-w-3xl p-8"><Link to={`/projects/${projectId}`} className="text-blue-600 hover:underline">Back to project</Link><h1 className="mt-6 text-2xl font-bold text-red-700">Error</h1><p className="mt-3 text-red-600">{error}</p></main>

  const isConsistent = cr !== null && cr <= 0.10
  return <main className="mx-auto max-w-7xl p-8">
    <Link to={`/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`} className="text-blue-600 hover:underline">Back to decision makers</Link>
    <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">AHP Pairwise Comparison Matrix — 7 Criteria</h1>
      <p className="mt-2 text-gray-600">Decision maker: <input value={expertName} onChange={e => setExpertName(e.target.value)} className="border rounded px-2 py-1 font-semibold" /></p>
      <p className="mt-2 text-sm text-gray-500">The seven active criteria are loaded from the database. There are exactly 21 independent comparisons; reciprocal values are generated automatically.</p>
    </section>
    {error && <div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

    {cr !== null && <section className={`mt-6 rounded-lg border p-6 ${isConsistent ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <h2 className="text-xl font-semibold">Consistency Ratio (CR): {cr.toFixed(4)}</h2>
      <p className="mt-1 text-sm">λ_max: {lambdaMax?.toFixed(4)} · CI: {ci?.toFixed(4)} · RI: 1.32</p>
      <p className="mt-2">{isConsistent ? 'Acceptable: CR ≤ 0.10. This expert can be saved and used by WAM.' : 'Inconsistent: CR > 0.10. Revise the comparisons before saving.'}</p>
    </section>}

    <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm overflow-x-auto">
      <h2 className="text-xl font-semibold">Pairwise comparisons — 21 independent values</h2>
      <table className="w-full border-collapse border text-sm mt-4"><thead><tr className="bg-gray-100"><th className="border p-2">Criterion</th>{criteria.map(c => <th key={c.id} className="border p-2 min-w-[130px]">{c.name}<br/><span className="text-xs">({c.code})</span></th>)}</tr></thead>
        <tbody>{criteria.map((row, ri) => <tr key={row.id}><td className="border bg-gray-50 p-2 font-medium">{row.name}</td>{criteria.map((col, ci) => {
          const diagonal = row.id === col.id
          const editable = ri < ci
          const value = matrix[row.id!]?.[col.id!] ?? 1
          return <td key={col.id} className="border p-2 text-center">{diagonal ? <span>1</span> : editable ? <select value={value} onChange={e => handleComparisonChange(row.id!, col.id!, Number(e.target.value))} className="border rounded p-1">{SAATY_SCALE.map(v => <option key={v} value={v}>{v}</option>)}</select> : <span className="font-mono">{Number(value).toFixed(3)}</span>}</td>
        })}</tr>)}</tbody>
      </table>
    </section>

    {weights.length === 7 && <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">AHP Criterion Weights</h2><span className="text-sm text-gray-500">Σ weights = {weights.reduce((s, w) => s + w.weight, 0).toFixed(6)}</span></div>
      <table className="w-full border-collapse border mt-4"><thead><tr className="bg-gray-100"><th className="border p-2 text-left">Criterion</th><th className="border p-2">Weight</th></tr></thead><tbody>{weights.map(w => <tr key={w.criterion_id}><td className="border p-2">{w.criterion_name}</td><td className="border p-2 text-center font-mono">{w.weight.toFixed(6)}</td></tr>)}</tbody></table>
      <button onClick={handleSave} disabled={saving || !isConsistent} className="mt-5 px-5 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400">{saving ? 'Saving…' : 'Save Expert AHP'}</button>
    </section>}
  </main>
}
