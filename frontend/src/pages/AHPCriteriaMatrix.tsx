import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Criterion } from './CriteriaSelection'

interface ComparisonMatrix {
  [rowId: string]: { [columnId: string]: number }
}
interface Weight { criterion_id: string; criterion_name: string; weight: number }

const RANDOM_INDEX: Record<number, number> = { 1: 0, 2: 0, 3: 0.58, 4: 0.9, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49 }
const SAATY_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export default function AHPCriteriaMatrix() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const datasetId = searchParams.get('datasetId')
  const expertId = searchParams.get('expertId')
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [expertName, setExpertName] = useState('')
  const [matrix, setMatrix] = useState<ComparisonMatrix>({})
  const [weights, setWeights] = useState<Weight[]>([])
  const [lambdaMax, setLambdaMax] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cr, setCr] = useState<number | null>(null)

  useEffect(() => {
    if (!datasetId) { setError('Dataset ID is missing from the URL.'); setLoading(false); return }
    try {
      const raw = localStorage.getItem(`criteria_${datasetId}`)
      if (!raw) throw new Error('No criteria found. Please select criteria first.')
      const parsed = JSON.parse(raw) as Criterion[]
      if (parsed.length !== 7) throw new Error(`The final methodology requires exactly 7 criteria. Currently selected: ${parsed.length}.`)
      setCriteria(parsed)
      const saved = expertId ? localStorage.getItem(`ahp_matrix_${datasetId}_${expertId}`) : null
      if (saved) {
        const p = JSON.parse(saved)
        setMatrix(p.matrix || {})
        if (p.expertName) setExpertName(p.expertName)
      } else {
        const initial: ComparisonMatrix = {}
        parsed.forEach(r => { initial[r.id] = {}; parsed.forEach(c => { initial[r.id][c.id] = 1 }) })
        setMatrix(initial)
      }
      setExpertName(prev => prev || (expertId ? `Expert ${expertId.slice(0, 8)}` : 'Default decision maker'))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load selected criteria.') }
    finally { setLoading(false) }
  }, [datasetId, expertId])

  useEffect(() => {
    if (criteria.length !== 7 || Object.keys(matrix).length !== 7) { setCr(null); setLambdaMax(null); setWeights([]); return }
    const ids = criteria.map(c => c.id)
    const n = ids.length
    const columnSums = ids.map(col => ids.reduce((s, row) => s + (matrix[row]?.[col] ?? 1), 0))
    const priority = ids.map(row => ids.reduce((s, col, i) => s + (matrix[row]?.[col] ?? 1) / columnSums[i], 0) / n)
    const weighted = ids.map(row => ids.reduce((s, col, i) => s + (matrix[row]?.[col] ?? 1) * priority[i], 0))
    const lambda = weighted.reduce((s, x, i) => s + x / priority[i], 0) / n
    const ci = (lambda - n) / (n - 1)
    const ratio = ci / RANDOM_INDEX[7]
    setLambdaMax(lambda)
    setCr(Math.max(0, ratio))
    setWeights(ids.map((id, i) => ({ criterion_id: id, criterion_name: `${criteria[i].name} (${criteria[i].code})`, weight: priority[i] })))
  }, [criteria, matrix])

  function handleComparisonChange(rowId: string, colId: string, value: number) {
    if (!Number.isFinite(value) || value <= 0) return
    setMatrix(current => ({ ...current, [rowId]: { ...current[rowId], [colId]: value }, [colId]: { ...current[colId], [rowId]: 1 / value } }))
  }

  async function handleSave() {
    if (!datasetId || !expertId) { setError('Dataset ID and decision maker ID are required.'); return }
    if (criteria.length !== 7) { setError('Exactly 7 criteria are required.'); return }
    if (cr === null || cr > 0.10) { setError(`Consistency Ratio must be ≤ 0.10. Current CR: ${cr?.toFixed(4) ?? 'N/A'}`); return }
    const expectedPairs = 7 * 6 / 2
    let pairs = 0
    for (let i = 0; i < criteria.length; i++) for (let j = i + 1; j < criteria.length; j++) if (matrix[criteria[i].id]?.[criteria[j].id]) pairs++
    if (pairs !== expectedPairs) { setError(`AHP requires ${expectedPairs} pairwise comparisons.`); return }
    setSaving(true); setError(null)
    try {
      localStorage.setItem(`ahp_matrix_${datasetId}_${expertId}`, JSON.stringify({ criteria, matrix, weights, lambdaMax, consistencyRatio: cr, expertName, savedAt: new Date().toISOString() }))
      navigate(`/projects/${projectId}/decision-makers?datasetId=${datasetId}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the AHP comparison matrix.') }
    finally { setSaving(false) }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center"><p>Loading AHP matrix...</p></main>
  if (error && criteria.length === 0) return <main className="mx-auto max-w-3xl p-8"><Link to={`/projects/${projectId}`} className="text-blue-600 hover:underline">Back to project</Link><h1 className="mt-6 text-2xl font-bold text-red-700">Error</h1><p className="mt-3 text-red-600">{error}</p></main>
  const isConsistent = cr !== null && cr <= 0.10
  return <main className="mx-auto max-w-7xl p-8">
    <Link to={`/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`} className="text-blue-600 hover:underline">Back to decision makers</Link>
    <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">AHP Pairwise Comparison Matrix — 7 Criteria</h1>
      <p className="mt-2 text-gray-600">Decision maker: <input value={expertName} onChange={e => setExpertName(e.target.value)} className="border rounded px-2 py-1 font-semibold" /></p>
      <p className="mt-2 text-sm text-gray-500">Seven criteria produce exactly 21 independent pairwise comparisons. Reciprocal values are generated automatically.</p>
    </section>
    {error && <div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    {cr !== null && <section className={`mt-6 rounded-lg border p-6 ${isConsistent ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}><h2 className="text-xl font-semibold">Consistency Ratio (CR): {cr.toFixed(4)}</h2><p className="mt-1 text-sm">λ_max: {lambdaMax?.toFixed(4)} · CI: {lambdaMax !== null ? ((lambdaMax - 7) / 6).toFixed(4) : '—'} · RI: 1.32</p><p className="mt-2">{isConsistent ? 'Acceptable: CR ≤ 0.10.' : 'Inconsistent: CR > 0.10. Revise the comparisons.'}</p></section>}
    <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm overflow-x-auto">
      <h2 className="text-xl font-semibold">Pairwise comparisons</h2>
      <table className="w-full border-collapse border text-sm mt-4"><thead><tr className="bg-gray-100"><th className="border p-2">Criterion</th>{criteria.map(c => <th key={c.id} className="border p-2 min-w-[130px]">{c.name}<br/><span className="text-xs">({c.code})</span></th>)}</tr></thead><tbody>{criteria.map((row, ri) => <tr key={row.id}><td className="border bg-gray-50 p-2 font-medium">{row.name}</td>{criteria.map((col, ci) => { const diagonal = row.id === col.id; const editable = ri < ci; const value = matrix[row.id]?.[col.id] ?? 1; return <td key={col.id} className="border p-2 text-center">{diagonal ? <span>1</span> : editable ? <select value={value} onChange={e => handleComparisonChange(row.id, col.id, Number(e.target.value))} className="border rounded p-1">{SAATY_SCALE.map(v => <option key={v} value={v}>{v}</option>)}</select> : <span className="font-mono">{Number(value).toFixed(3)}</span>}</td>})}</tr>)}</tbody></table>
    </section>
    {weights.length === 7 && <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">AHP Criterion Weights</h2><table className="w-full border-collapse border mt-4"><thead><tr className="bg-gray-100"><th className="border p-2 text-left">Criterion</th><th className="border p-2">Weight</th></tr></thead><tbody>{weights.map(w => <tr key={w.criterion_id}><td className="border p-2">{w.criterion_name}</td><td className="border p-2 text-center font-mono">{w.weight.toFixed(6)}</td></tr>)}</tbody></table><button onClick={handleSave} disabled={saving || !isConsistent} className="mt-5 px-5 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400">{saving ? 'Saving…' : 'Save Expert AHP'}</button></section>}
  </main>
}
