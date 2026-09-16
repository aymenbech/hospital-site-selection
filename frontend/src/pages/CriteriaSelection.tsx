import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'

import { api, RawDataset } from '../services/api'

export interface Criterion {
  id: string
  code: string
  name: string
  type: 'benefit' | 'cost'
  source_column: string
}

export default function CriteriaSelection() {
  const { projectId, datasetId } = useParams<{
    projectId: string
    datasetId: string
  }>()

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [dataset, setDataset] = useState<RawDataset | null>(null)
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // أعمدة افتراضية للتجربة (سيتم جلبها من الـ backend لاحقاً)
  const defaultColumns = [
    'ID_ZONE',
    'Harm',
    'Noise',
    'CLIMAT',
    'IMPACTS',
    'ACCESSIBIL',
    'EQUIPEMENT',
    'GEOTECHNIQ',
  ]

  useEffect(() => {
    async function loadData() {
      if (!projectId || !datasetId) {
        setError('Project ID or Dataset ID is missing.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)

        const datasets = await api.getProjectDatasets(projectId)
        const selectedDataset = datasets.find((d) => d.id === datasetId)

        if (!selectedDataset) {
          setError('Dataset not found.')
          setLoading(false)
          return
        }

        setDataset(selectedDataset)
        setAvailableColumns(defaultColumns)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data.')
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [projectId, datasetId])

  function handleAddCriterion(column: string) {
    // التحقق من عدم التكرار
    if (criteria.some((c) => c.source_column === column)) {
      return
    }

    const newCriterion: Criterion = {
      id: crypto.randomUUID(),
      code: column.toLowerCase().slice(0, 10),
      name: column,
      type: 'benefit',
      source_column: column,
    }

    setCriteria((prev) => [...prev, newCriterion])
  }

  function handleRemoveCriterion(criterionId: string) {
    setCriteria((prev) => prev.filter((c) => c.id !== criterionId))
  }

  function handleTypeChange(criterionId: string, type: 'benefit' | 'cost') {
    setCriteria((prev) =>
      prev.map((c) => (c.id === criterionId ? { ...c, type } : c)),
    )
  }

  function handleCodeChange(criterionId: string, code: string) {
    setCriteria((prev) =>
      prev.map((c) => (c.id === criterionId ? { ...c, code } : c)),
    )
  }

  function handleNameChange(criterionId: string, name: string) {
    setCriteria((prev) =>
      prev.map((c) => (c.id === criterionId ? { ...c, name } : c)),
    )
  }

  async function handleSave() {
    if (!datasetId || criteria.length === 0) {
      setError('Please select at least one criterion.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // هنا نرسل المعايير للـ backend
      // const response = await api.createCriteria(datasetId, criteria)

      // حفظ مؤقت في localStorage للتجربة
      const criteriaKey = `criteria_${datasetId}`
      localStorage.setItem(criteriaKey, JSON.stringify(criteria))

      // الانتقال لصفحة صناع القرار
      navigate(`/projects/${projectId}/decision-makers`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save criteria.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-gray-700">Loading…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <Link
          to={`/projects/${projectId}`}
          className="text-blue-600 hover:underline"
        >
          ← Back to project
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-red-700">Error</h1>
        <p className="mt-3 text-red-600">{error}</p>
      </main>
    )
  }

  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link
        to={`/projects/${projectId}`}
        className="text-blue-600 hover:underline"
      >
        ← Back to project
      </Link>

      {/* Header */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          Select Criteria
        </h1>

        <p className="mt-2 text-gray-600">
          Dataset: {dataset?.name || datasetId}
        </p>

        <p className="mt-1 text-sm text-gray-500">
          Select the columns that represent your evaluation criteria, then specify
          whether each is a benefit (higher is better) or cost (lower is better).
        </p>
      </section>

      {/* Available Columns */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Available Columns
        </h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {availableColumns.map((column) => {
            const isSelected = criteria.some((c) => c.source_column === column)

            return (
              <button
                key={column}
                onClick={() => !isSelected && handleAddCriterion(column)}
                disabled={isSelected}
                className={`px-3 py-1 border rounded ${
                  isSelected
                    ? 'bg-green-100 border-green-500 text-green-700 cursor-not-allowed'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {isSelected ? '✓ ' : '+ '}
                {column}
              </button>
            )
          })}
        </div>
      </section>

      {/* Selected Criteria */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Selected Criteria ({criteria.length})
        </h2>

        {criteria.length === 0 ? (
          <p className="mt-3 text-gray-500">
            No criteria selected yet. Click on columns above to add them.
          </p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Code</th>
                  <th className="border p-2 text-left">Name</th>
                  <th className="border p-2 text-left">Source Column</th>
                  <th className="border p-2 text-left">Type</th>
                  <th className="border p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((criterion, index) => (
                  <tr key={criterion.id} className="hover:bg-gray-50">
                    <td className="border p-2">
                      <input
                        type="text"
                        value={criterion.code}
                        onChange={(e) =>
                          handleCodeChange(criterion.id, e.target.value)
                        }
                        className="w-full border rounded px-2 py-1"
                        placeholder="e.g., noise"
                      />
                    </td>
                    <td className="border p-2">
                      <input
                        type="text"
                        value={criterion.name}
                        onChange={(e) =>
                          handleNameChange(criterion.id, e.target.value)
                        }
                        className="w-full border rounded px-2 py-1"
                        placeholder="e.g., Noise Level"
                      />
                    </td>
                    <td className="border p-2">{criterion.source_column}</td>
                    <td className="border p-2">
                      <select
                        value={criterion.type}
                        onChange={(e) =>
                          handleTypeChange(
                            criterion.id,
                            e.target.value as 'benefit' | 'cost',
                          )
                        }
                        className="border rounded px-2 py-1"
                      >
                        <option value="benefit">Benefit (higher is better)</option>
                        <option value="cost">Cost (lower is better)</option>
                      </select>
                    </td>
                    <td className="border p-2">
                      <button
                        onClick={() => handleRemoveCriterion(criterion.id)}
                        className="text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex gap-4">
          <button
            onClick={handleSave}
            disabled={criteria.length === 0 || saving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {saving ? 'Saving…' : 'Save & Continue'}
          </button>

          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>

        {error && (
          <p className="mt-4 text-red-600">{error}</p>
        )}

        <div className="mt-6 flex gap-4">
  <button
    onClick={handleSave}
    disabled={criteria.length === 0 || saving}
    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
  >
    {saving ? 'Saving…' : 'Continue to AHP'}
  </button>

  <button
    onClick={() =>
      navigate(`/projects/${projectId}/wam-weights?datasetId=${datasetId}`)
    }
    disabled={criteria.length === 0}
    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
  >
    Use WAM Instead
  </button>

  <button
    onClick={() => navigate(`/projects/${projectId}`)}
    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
  >
    Cancel
  </button>
</div>
      </section>

      {/* Info Box */}
      <section className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900">
          ℹ️ Benefit vs Cost Criteria
        </h3>

        <div className="mt-3 text-sm text-blue-800">
          <p>
            <strong>Benefit criteria:</strong> Higher values are better (e.g.,
            Accessibility, Climate Suitability).
          </p>
          <p className="mt-2">
            <strong>Cost criteria:</strong> Lower values are better (e.g., Noise,
            Harm, Distance to Equipment).
          </p>
        </div>
      </section>
    </main>
  )
}