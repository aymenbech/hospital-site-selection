import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { decisionMakerService, DecisionMaker } from '../services/decisionMakerService'

export default function DecisionMakers() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const datasetId = searchParams.get('datasetId')

  const [decisionMakers, setDecisionMakers] = useState<DecisionMaker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    async function loadDecisionMakers() {
      if (!projectId) { setError('Project ID is missing.'); setLoading(false); return }
      try { setLoading(true); setDecisionMakers(await decisionMakerService.getProjectDecisionMakers(projectId)) }
      catch (err) { setError(err instanceof Error ? err.message : 'Failed to load decision makers.') }
      finally { setLoading(false) }
    }
    void loadDecisionMakers()
  }, [projectId])

  async function handleAddDecisionMaker() {
    if (!projectId || !newName.trim()) { setError('Name is required.'); return }
    setAdding(true); setError(null)
    try {
      const newDM = await decisionMakerService.createDecisionMaker(projectId, newName.trim(), newEmail.trim() || undefined, newRole.trim() || undefined)
      setDecisionMakers(prev => [...prev, newDM]); setNewName(''); setNewEmail(''); setNewRole('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to add decision maker.') }
    finally { setAdding(false) }
  }

  function handleSelectDecisionMaker(dmId: string) {
    if (!datasetId) { setError('Please select a dataset and criteria first.'); return }
    navigate(`/projects/${projectId}/ahp-matrix?datasetId=${datasetId}&expertId=${dmId}`)
  }

  function handleGoToWAMAggregation() {
    if (!datasetId) { setError('Please select a dataset first.'); return }
    navigate(`/projects/${projectId}/wam-aggregation?datasetId=${datasetId}`)
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><p className="text-lg text-gray-700">Loading decision makers…</p></main>
  if (error && !decisionMakers.length) return <main className="max-w-3xl mx-auto p-8"><Link to={`/projects/${projectId}`} className="text-blue-600 hover:underline">← Back to project</Link><h1 className="mt-6 text-2xl font-bold text-red-700">Error</h1><p className="mt-3 text-red-600">{error}</p></main>

  return <main className="max-w-6xl mx-auto p-8">
    <Link to={`/projects/${projectId}`} className="text-blue-600 hover:underline">← Back to project</Link>

    <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-900">Decision Makers (Experts)</h1>
      <p className="mt-2 text-gray-600">Each expert completes an independent AHP assessment using the same 7 criteria.</p>
      {datasetId && <p className="mt-2 text-sm text-blue-600">Current dataset: <strong>{datasetId.slice(0, 8)}...</strong></p>}
    </section>

    <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">Add New Decision Maker</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div><label className="block text-sm font-medium text-gray-700">Name *</label><input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="Dr. Ahmed Mohamed" /></div>
        <div><label className="block text-sm font-medium text-gray-700">Email</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="ahmed@example.com" /></div>
        <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700">Role</label><input type="text" value={newRole} onChange={e => setNewRole(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="Urban Planning Expert" /></div>
      </div>
      <button onClick={handleAddDecisionMaker} disabled={adding || !newName.trim()} className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400">{adding ? 'Adding…' : 'Add Decision Maker'}</button>
      {error && <p className="mt-4 text-red-600">{error}</p>}
    </section>

    <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">Expert AHP assessments</h2>
      {decisionMakers.length === 0 ? <p className="mt-3 text-gray-500">No decision makers added yet.</p> : <div className="overflow-x-auto"><table className="w-full mt-4 border-collapse border"><thead><tr className="bg-gray-100"><th className="border p-2 text-left">Name</th><th className="border p-2 text-left">Email</th><th className="border p-2 text-left">Role</th><th className="border p-2 text-left">Action</th></tr></thead><tbody>{decisionMakers.map(dm => <tr key={dm.id} className="hover:bg-gray-50"><td className="border p-2">{dm.name}</td><td className="border p-2">{dm.email || '—'}</td><td className="border p-2">{dm.role || '—'}</td><td className="border p-2"><button onClick={() => handleSelectDecisionMaker(dm.id)} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Enter / Edit AHP</button></td></tr>)}</tbody></table></div>}

      {decisionMakers.length > 0 && <div className="mt-6 rounded-lg border border-purple-200 bg-purple-50 p-5"><h3 className="font-semibold text-purple-900">Final methodology</h3><ol className="mt-2 text-sm text-purple-900 list-decimal list-inside space-y-1"><li>Each expert completes AHP for the 7 criteria (21 pairwise comparisons).</li><li>Only consistent AHP assessments with CR ≤ 0.10 are accepted.</li><li>WAM calculates a separate score for each expert using that expert's AHP weights.</li><li>Expert WAM scores are averaged equally to obtain the final ranking.</li></ol><button onClick={handleGoToWAMAggregation} className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Calculate Final Ranking (WAM + Expert Average)</button></div>}
    </section>
  </main>
}
