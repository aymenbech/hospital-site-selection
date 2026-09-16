import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'

interface ExpertAHPData {
  expert_id: string
  expert_name: string
  criteria_weights: {
    criterion_id: string
    criterion_name: string
    weight: number
  }[]
  consistency_ratio: number
  saved_at: string
}

interface ExpertWithWeight extends ExpertAHPData {
  expertise_weight: number
}

interface AggregatedWeight {
  criterion_id: string
  criterion_name: string
  aggregated_weight: number
  individual_weights: number[]
}

export default function WAMAggregation() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const datasetId = searchParams.get('datasetId')

  const [experts, setExperts] = useState<ExpertWithWeight[]>([])
  const [aggregatedWeights, setAggregatedWeights] = useState<AggregatedWeight[]>([])
  const [aggregationMethod, setAggregationMethod] = useState<'wam' | 'average' | 'median'>('wam')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [calculating, setCalculating] = useState(false)

  useEffect(() => {
    function loadExpertsData() {
      if (!datasetId) {
        setError('Dataset ID is missing.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)

        // جلب جميع الخبراء الذين أكملوا AHP
        const storedExperts: ExpertWithWeight[] = []

        // البحث عن جميع مفاتيح AHP المحفوظة
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)

          if (key && key.startsWith(`ahp_matrix_${datasetId}_`)) {
            const data = localStorage.getItem(key)

            if (data) {
              const parsed = JSON.parse(data)

              // استخراج expert_id من المفتاح
              const expertId = key.replace(`ahp_matrix_${datasetId}_`, '')

              // التحقق من وجود أوزان و CR مقبول
              if (parsed.weights && parsed.weights.length > 0 && parsed.consistencyRatio <= 0.1) {
                storedExperts.push({
                  expert_id: expertId,
                  expert_name: parsed.expertName || `Expert ${expertId.slice(0, 8)}`,
                  expertise_weight: 1.0, // وزن الخبرة الافتراضي
                  criteria_weights: parsed.weights,
                  consistency_ratio: parsed.consistencyRatio,
                  saved_at: parsed.savedAt,
                })
              }
            }
          }
        }

        if (storedExperts.length === 0) {
          setError('No experts have completed AHP with acceptable CR (≤ 0.1).')
          setLoading(false)
          return
        }

        setExperts(storedExperts)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load experts data.')
      } finally {
        setLoading(false)
      }
    }

    void loadExpertsData()
  }, [datasetId])

  function handleExpertiseWeightChange(expertId: string, weight: number) {
    setExperts((prev) =>
      prev.map((expert) =>
        expert.expert_id === expertId
          ? { ...expert, expertise_weight: weight }
          : expert,
      ),
    )
  }

  function calculateAggregatedWeights() {
    setCalculating(true)

    try {
      if (experts.length === 0) {
        setError('No experts data available.')
        return
      }

      // تجميع كل المعايير
      const allCriteriaIds = new Set<string>()
      const criterionNames = new Map<string, string>()

      experts.forEach((expert) => {
        expert.criteria_weights.forEach((cw) => {
          allCriteriaIds.add(cw.criterion_id)
          criterionNames.set(cw.criterion_id, cw.criterion_name)
        })
      })

      const aggregated: AggregatedWeight[] = []

      allCriteriaIds.forEach((criterionId) => {
        const individualWeights: number[] = []
        const weightedValues: number[] = []
        let totalExpertiseWeight = 0

        experts.forEach((expert) => {
          const criterionWeight = expert.criteria_weights.find(
            (cw) => cw.criterion_id === criterionId,
          )

          if (criterionWeight) {
            individualWeights.push(criterionWeight.weight)
            weightedValues.push(criterionWeight.weight * expert.expertise_weight)
            totalExpertiseWeight += expert.expertise_weight
          }
        })

        let aggregatedWeight = 0

        if (aggregationMethod === 'wam') {
          // Weighted Arithmetic Mean
          const sumWeighted = weightedValues.reduce((a, b) => a + b, 0)
          aggregatedWeight = totalExpertiseWeight > 0 ? sumWeighted / totalExpertiseWeight : 0
        } else if (aggregationMethod === 'average') {
          // Simple Average
          aggregatedWeight = individualWeights.reduce((a, b) => a + b, 0) / individualWeights.length
        } else {
          // Median
          const sorted = [...individualWeights].sort((a, b) => a - b)
          const mid = Math.floor(sorted.length / 2)
          aggregatedWeight = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid]
        }

        aggregated.push({
          criterion_id: criterionId,
          criterion_name: criterionNames.get(criterionId) || criterionId,
          aggregated_weight: aggregatedWeight,
          individual_weights: individualWeights,
        })
      })

      // تطبيع الأوزان المجمعة (المجموع = 1)
      const totalWeight = aggregated.reduce((sum, w) => sum + w.aggregated_weight, 0)

      if (totalWeight > 0) {
        aggregated.forEach((w) => {
          w.aggregated_weight = w.aggregated_weight / totalWeight
        })
      }

      setAggregatedWeights(aggregated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate aggregated weights.')
    } finally {
      setCalculating(false)
    }
  }

  async function handleSave() {
    if (!datasetId || aggregatedWeights.length === 0) {
      setError('Please calculate aggregated weights first.')
      return
    }

    try {
      // حفظ الأوزان المجمعة في localStorage
      localStorage.setItem(
        `aggregated_weights_${datasetId}`,
        JSON.stringify({
          weights: aggregatedWeights,
          method: aggregationMethod,
          experts: experts.map(e => ({
            id: e.expert_id,
            name: e.expert_name,
            expertise_weight: e.expertise_weight,
          })),
          savedAt: new Date().toISOString(),
        }),
      )

      // حفظ المعايير مع الأوزان المجمعة
      const criteriaWithWeights = aggregatedWeights.map((w) => ({
        criterion_id: w.criterion_id,
        criterion_name: w.criterion_name,
        weight: w.aggregated_weight,
      }))

      localStorage.setItem(
        `criteria_weighted_${datasetId}`,
        JSON.stringify(criteriaWithWeights),
      )

      // الانتقال لصفحة SAW
      navigate(`/projects/${projectId}/saw-analysis?datasetId=${datasetId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save aggregated weights.')
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-gray-700">Loading WAM Aggregation…</p>
      </main>
    )
  }

  if (error && experts.length === 0) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <Link
          to={`/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`}
          className="text-blue-600 hover:underline"
        >
          ← Back to decision makers
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-red-700">Error</h1>
        <p className="mt-3 text-red-600">{error}</p>

        <div className="mt-6">
          <button
            onClick={() => navigate(`/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add More Experts
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-7xl mx-auto p-8">
      <Link
        to={`/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`}
        className="text-blue-600 hover:underline"
      >
        ← Back to decision makers
      </Link>

      {/* Header */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          WAM Aggregation (Group Weights)
        </h1>

        <p className="mt-2 text-gray-600">
          Aggregate individual expert weights from AHP into collective weights.
        </p>

        <p className="mt-1 text-sm text-gray-500">
          Number of experts: <strong>{experts.length}</strong>
        </p>
      </section>

      {/* Experts Table */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Experts & Expertise Weights
        </h2>

        <p className="mt-2 text-sm text-gray-600">
          Assign expertise weight (1-10) to each expert based on their experience level.
        </p>

        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Expert Name</th>
                <th className="border p-2 text-left">Consistency Ratio (CR)</th>
                <th className="border p-2 text-left">Expertise Weight (1-10)</th>
                <th className="border p-2 text-left">Number of Criteria</th>
              </tr>
            </thead>
            <tbody>
              {experts.map((expert) => (
                <tr key={expert.expert_id} className="hover:bg-gray-50">
                  <td className="border p-2">
                    <div>
                      <p className="font-medium">{expert.expert_name}</p>
                      <p className="text-xs text-gray-500">
                        Saved: {new Date(expert.saved_at).toLocaleString()}
                      </p>
                    </div>
                  </td>
                  <td className="border p-2">
                    <span className={expert.consistency_ratio <= 0.1 ? 'text-green-600' : 'text-red-600'}>
                      {expert.consistency_ratio.toFixed(4)}
                    </span>
                  </td>
                  <td className="border p-2">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      step="0.1"
                      value={expert.expertise_weight}
                      onChange={(e) =>
                        handleExpertiseWeightChange(
                          expert.expert_id,
                          parseFloat(e.target.value) || 1.0,
                        )
                      }
                      className="border rounded px-2 py-1 w-24"
                    />
                  </td>
                  <td className="border p-2">{expert.criteria_weights.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Aggregation Method */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Aggregation Method
        </h2>

        <div className="mt-4 flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="method"
              value="wam"
              checked={aggregationMethod === 'wam'}
              onChange={() => setAggregationMethod('wam')}
            />
            <span>WAM (Weighted Arithmetic Mean) - Recommended</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="method"
              value="average"
              checked={aggregationMethod === 'average'}
              onChange={() => setAggregationMethod('average')}
            />
            <span>Simple Average</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="method"
              value="median"
              checked={aggregationMethod === 'median'}
              onChange={() => setAggregationMethod('median')}
            />
            <span>Median</span>
          </label>
        </div>

        <button
          onClick={calculateAggregatedWeights}
          disabled={calculating || experts.length === 0}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {calculating ? 'Calculating…' : 'Calculate Aggregated Weights'}
        </button>
      </section>

      {/* Aggregated Weights Results */}
      {aggregatedWeights.length > 0 && (
        <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Aggregated Weights ({aggregationMethod.toUpperCase()})
          </h2>

          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Criterion</th>
                  <th className="border p-2 text-left">Aggregated Weight</th>
                  <th className="border p-2 text-left">Individual Weights</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedWeights.map((w) => (
                  <tr key={w.criterion_id} className="hover:bg-gray-50">
                    <td className="border p-2">{w.criterion_name}</td>
                    <td className="border p-2 font-mono font-bold text-blue-700">
                      {w.aggregated_weight.toFixed(4)}
                    </td>
                    <td className="border p-2 text-sm text-gray-600">
                      {w.individual_weights.map((iw, idx) => (
                        <span key={idx} className="mr-2">
                          {iw.toFixed(3)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save & Continue to SAW
            </button>

            <button
              onClick={() => navigate(`/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Back
            </button>
          </div>
        </section>
      )}

      {/* Info Box */}
      <section className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900">
          ℹ️ What is WAM?
        </h3>

        <div className="mt-3 text-sm text-blue-800">
          <p>
            <strong>Weighted Arithmetic Mean (WAM)</strong> combines individual expert
            weights by considering each expert's expertise level.
          </p>
          <p className="mt-2">
            Formula:{' '}
            <code className="bg-white px-2 py-1 rounded">
              w_final = Σ(w_expert × w_criterion) / Σ(w_expert)
            </code>
          </p>
          <p className="mt-2">
            This method is recommended for group decision-making as it accounts for
            differences in expert knowledge and experience.
          </p>
        </div>
      </section>
    </main>
  )
}