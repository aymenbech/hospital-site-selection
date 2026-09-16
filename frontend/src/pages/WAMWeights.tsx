import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'

import { Criterion } from './CriteriaSelection'

export default function WAMWeights() {
  const { projectId, datasetId } = useParams<{
    projectId: string
    datasetId: string
  }>()

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [totalWeight, setTotalWeight] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function loadCriteria() {
      if (!datasetId) {
        setError('Dataset ID is missing.')
        setLoading(false)
        return
      }

      try {
        const criteriaKey = `criteria_${datasetId}`
        const stored = localStorage.getItem(criteriaKey)

        if (!stored) {
          setError('No criteria found. Please select criteria first.')
          setLoading(false)
          return
        }

        const parsedCriteria: Criterion[] = JSON.parse(stored)
        setCriteria(parsedCriteria)

        // Initialize weights equally
        const initialWeights: Record<string, number> = {}
        const equalWeight = 100 / parsedCriteria.length

        parsedCriteria.forEach((c) => {
          initialWeights[c.id] = equalWeight
        })

        setWeights(initialWeights)
        setTotalWeight(100)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load criteria.')
      } finally {
        setLoading(false)
      }
    }

    void loadCriteria()
  }, [datasetId])

  function handleWeightChange(criterionId: string, value: number) {
    setWeights((prev) => {
      const newWeights = { ...prev, [criterionId]: value }

      // Calculate total
      const total = Object.values(newWeights).reduce((sum, w) => sum + w, 0)
      setTotalWeight(total)

      return newWeights
    })
  }

  function handleAutoNormalize() {
    if (totalWeight === 0) return

    setWeights((prev) => {
      const normalized: Record<string, number> = {}

      Object.entries(prev).forEach(([id, weight]) => {
        normalized[id] = (weight / totalWeight) * 100
      })

      setTotalWeight(100)
      return normalized
    })
  }

  async function handleSave() {
    if (criteria.length === 0) {
      setError('No criteria found.')
      return
    }

    if (Math.abs(totalWeight - 100) > 0.01) {
      setError(`Total weight must be 100%. Current: ${totalWeight.toFixed(2)}%`)
      return
    }

    setSaving(true)
    setError(null)

    try {
      // تحويل الأوزان إلى كسور (0-1)
      const normalizedWeights: Record<string, number> = {}

      Object.entries(weights).forEach(([id, weight]) => {
        normalizedWeights[id] = weight / 100
      })

      // حفظ في localStorage
      const weightsKey = `wam_weights_${datasetId}`
      localStorage.setItem(weightsKey, JSON.stringify(normalizedWeights))

      // الانتقال لصفحة SAW
      navigate(`/projects/${projectId}/saw?method=wam`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save weights.')
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
          to={`/projects/${projectId}/criteria?datasetId=${datasetId}`}
          className="text-blue-600 hover:underline"
        >
          ← Back to criteria selection
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-red-700">Error</h1>
        <p className="mt-3 text-red-600">{error}</p>
      </main>
    )
  }

  return (
    <main className="max-w-5xl mx-auto p-8">
      <Link
        to={`/projects/${projectId}`}
        className="text-blue-600 hover:underline"
      >
        ← Back to project
      </Link>

      {/* Header */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          WAM: Assign Weights
        </h1>

        <p className="mt-2 text-gray-600">
          Assign weights to each criterion (total must equal 100%).
        </p>
      </section>

      {/* Weights Form */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Criterion Weights
        </h2>

        {criteria.length === 0 ? (
          <p className="mt-3 text-gray-500">No criteria found.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {criteria.map((criterion) => (
              <div key={criterion.id} className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {criterion.name} ({criterion.code})
                  </label>
                  <p className="text-xs text-gray-500">
                    Type: {criterion.type === 'benefit' ? 'Benefit' : 'Cost'}
                  </p>
                </div>

                <div className="w-48">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={weights[criterion.id] ?? 0}
                    onChange={(e) =>
                      handleWeightChange(criterion.id, parseFloat(e.target.value) || 0)
                    }
                    className="w-full border rounded px-3 py-2"
                    placeholder="0"
                  />
                </div>

                <div className="w-32 text-right text-sm text-gray-600">
                  {(weights[criterion.id] ?? 0).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total Weight Display */}
        <div className="mt-6 p-4 bg-gray-50 border rounded">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-gray-700">
              Total Weight:
            </span>
            <span
              className={`text-2xl font-bold ${
                Math.abs(totalWeight - 100) < 0.01
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {totalWeight.toFixed(2)}%
            </span>
          </div>

          {Math.abs(totalWeight - 100) > 0.01 && (
            <p className="mt-2 text-sm text-red-600">
              ⚠️ Total must equal 100%. Adjust weights above.
            </p>
          )}
        </div>

        {/* Auto Normalize Button */}
        <div className="mt-4">
          <button
            onClick={handleAutoNormalize}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Auto-Normalize to 100%
          </button>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving || criteria.length === 0 || Math.abs(totalWeight - 100) > 0.01}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {saving ? 'Saving…' : 'Save & Run SAW'}
          </button>

          <button
            onClick={() =>
              navigate(`/projects/${projectId}/criteria?datasetId=${datasetId}`)
            }
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Back to Criteria
          </button>
        </div>

        {error && (
          <p className="mt-4 text-red-600">{error}</p>
        )}
      </section>

      {/* Info Box */}
      <section className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900">
          ℹ️ WAM (Weighted Arithmetic Mean)
        </h3>

        <p className="mt-2 text-sm text-blue-800">
          WAM allows you to directly assign weights to criteria without pairwise
          comparisons. This is faster than AHP but less precise for complex decisions.
        </p>

        <ul className="mt-3 text-sm text-blue-800 list-disc list-inside space-y-1">
          <li>Assign weights as percentages (total = 100%).</li>
          <li>Use "Auto-Normalize" to automatically adjust weights.</li>
          <li>Click "Save & Run SAW" to calculate results.</li>
        </ul>
      </section>
    </main>
  )
}