import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { api, RawDataset, CriterionPayload } from '../services/api'

const DEFAULT_COLUMNS = ['Harm', 'Noise', 'CLIMAT', 'IMPACTS', 'ACCESSIBIL', 'EQUIPEMENT', 'GEOTECHNIQ']

export default function CriteriaSelection() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const datasetId = searchParams.get('datasetId')
  const navigate = useNavigate()
  const [dataset, setDataset] = useState<RawDataset | null>(null)
  const [criteria, setCriteria] = useState<CriterionPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!projectId || !datasetId) {
        setError('Project or dataset is missing.')
        setLoading(false)
        return
      }
      try {
        const datasets = await api.getProjectDatasets(projectId)
        const selected = datasets.find((d) => d.id === datasetId)
        if (!selected) throw new Error('Dataset not found.')
        setDataset(selected)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dataset.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [projectId, datasetId])

  function addCriterion(column: string) {
    if (criteria.some((c) => c.source_column === column) || criteria.length >= 7) return
    setCriteria((prev) => [...prev, {
      code: `C${prev.length + 1}`,
      name: column,
      type: 'benefit',
      source_column: column,
    }])
  }

  function removeCriterion(code: string) {
    setCriteria((prev) => prev.filter((c) => c.code !== code).map((c, i) => ({ ...c, code: `C${i + 1}` })))
  }

  async function save() {
    if (!projectId || !datasetId) return
    if (criteria.length !== 7) {
      setError('The final AHP model requires exactly 7 active criteria.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.saveCriteria(projectId, datasetId, criteria)
      navigate(`/decision-makers?projectId=${projectId}&datasetId=${datasetId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save criteria.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><p>Loading…</p></main>

  if (error && !dataset) return <main className="max-w-3xl mx-auto p-8"><Link to={`/projects/${projectId}`}>← Back</Link><p className="mt-6 text-red-600">{error}</p></main>

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link to={`/projects/${projectId}`} className="text-sm text-blue-600 hover:underline">← Back to project</Link>

        <header className="mt-5 rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-600">Step 4 · Criteria</p>
              <h1 className="text-3xl font-bold text-slate-900 mt-1">Select evaluation criteria</h1>
              <p className="text-slate-500 mt-2">Dataset: <span className="font-medium text-slate-700">{dataset?.name || datasetId}</span></p>
            </div>
            <div className="rounded-xl bg-slate-100 px-5 py-3 text-center">
              <div className="text-2xl font-bold text-slate-900">{criteria.length}/7</div>
              <div className="text-xs text-slate-500">active criteria</div>
            </div>
          </div>
        </header>

        <section className="mt-6 grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Available columns</h2>
            <p className="text-sm text-slate-500 mt-1">Choose the seven columns used by the decision model.</p>
            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              {DEFAULT_COLUMNS.map((column) => {
                const selected = criteria.some((c) => c.source_column === column)
                return <button key={column} onClick={() => addCriterion(column)} disabled={selected || criteria.length >= 7}
                  className={`text-left rounded-xl border p-4 transition ${selected ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50'}`}>
                  <span className="font-medium">{selected ? '✓ ' : '+ '}{column}</span>
                </button>
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Selected criteria</h2>
            <p className="text-sm text-slate-500 mt-1">Define whether each criterion is a benefit or a cost.</p>
            <div className="mt-4 space-y-3">
              {criteria.map((criterion) => <div key={criterion.code} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><span className="text-xs font-bold text-blue-600">{criterion.code}</span><p className="font-medium text-slate-900">{criterion.name}</p><p className="text-xs text-slate-500">{criterion.source_column}</p></div>
                  <button onClick={() => removeCriterion(criterion.code)} className="text-sm text-red-600 hover:underline">Remove</button>
                </div>
                <select value={criterion.type} onChange={(e) => setCriteria(prev => prev.map(c => c.code === criterion.code ? { ...c, type: e.target.value as 'benefit' | 'cost' } : c))} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="benefit">Benefit — higher is better</option>
                  <option value="cost">Cost — lower is better</option>
                </select>
              </div>)}
              {criteria.length === 0 && <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">No criteria selected yet.</div>}
            </div>
          </div>
        </section>

        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section className="mt-6 rounded-2xl bg-blue-50 border border-blue-200 p-5">
          <p className="font-semibold text-blue-900">AHP model requirement</p>
          <p className="text-sm text-blue-800 mt-1">The final methodology uses exactly 7 criteria, requiring 21 pairwise comparisons for each expert.</p>
        </section>

        <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="rounded-xl px-5 py-3 bg-white border border-slate-300 text-slate-700">Cancel</button>
          <button onClick={save} disabled={criteria.length !== 7 || saving} className="rounded-xl px-6 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed">{saving ? 'Saving…' : 'Save & continue to experts'}</button>
        </div>
      </div>
    </main>
  )
}
