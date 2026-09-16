import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'

interface Criterion {
  id: string
  code: string
  name: string
  type: 'benefit' | 'cost'
  source_column: string
  weight: number
}

interface Zone {
  zone_id: string
  zone_name: string | null
  criteria_values: Record<string, number>
  saw_score: number
  rank: number
}

interface SAWResult {
  analysis_run_id: string
  ahp_run_id: string
  total_zones: number
  scores: {
    zone_id: string
    zone_name: string | null
    score: string
    rank: number
  }[]
}

export default function SAWAnalysis() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const datasetId = searchParams.get('datasetId')

  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<SAWResult | null>(null)

  useEffect(() => {
    function loadData() {
      if (!datasetId) {
        setError('Dataset ID is missing.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)

        // جلب المعايير الموزونة
        const weightedCriteriaKey = `criteria_weighted_${datasetId}`
        const storedCriteria = localStorage.getItem(weightedCriteriaKey)

        if (!storedCriteria) {
          setError('No weighted criteria found. Please complete WAM aggregation first.')
          setLoading(false)
          return
        }

        const parsedCriteria: Criterion[] = JSON.parse(storedCriteria)
        setCriteria(parsedCriteria)

        // جلب البيانات الخام (للتجربة - بيانات وهمية)
        // في الواقع ستجلب من backend
        const mockZones: Zone[] = []

        for (let i = 1; i <= 10; i++) {
          const zoneValues: Record<string, number> = {}

          parsedCriteria.forEach((c) => {
            zoneValues[c.id] = Math.random() * 100
          })

          mockZones.push({
            zone_id: `ZONE_${i.toString().padStart(3, '0')}`,
            zone_name: `Zone ${i}`,
            criteria_values: zoneValues,
            saw_score: 0,
            rank: 0,
          })
        }

        setZones(mockZones)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data.')
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [datasetId])

  function calculateSAW() {
    if (criteria.length === 0 || zones.length === 0) {
      setError('No data available for SAW calculation.')
      return
    }

    // حساب min/max لكل معيار
    const criterionStats: Record<string, { min: number; max: number }> = {}

    criteria.forEach((c) => {
      const values = zones.map((z) => z.criteria_values[c.id] || 0)
      criterionStats[c.id] = {
        min: Math.min(...values),
        max: Math.max(...values),
      }
    })

    // حساب درجات SAW
    const calculatedZones = zones.map((zone) => {
      let totalScore = 0

      criteria.forEach((c) => {
        const value = zone.criteria_values[c.id] || 0
        const { min, max } = criterionStats[c.id]

        // تطبيع
        let normalized = 0
        if (max - min === 0) {
          normalized = 1
        } else {
          normalized = (value - min) / (max - min)
        }

        // تطبيق الوزن حسب النوع
        if (c.type === 'benefit') {
          totalScore += c.weight * normalized
        } else {
          totalScore += c.weight * (1 - normalized)
        }
      })

      return {
        ...zone,
        saw_score: totalScore,
      }
    })

    // الترتيب
    calculatedZones.sort((a, b) => b.saw_score - a.saw_score)

    calculatedZones.forEach((zone, index) => {
      zone.rank = index + 1
    })

    setZones(calculatedZones)
  }

  async function handleRunSAW() {
    if (!datasetId) {
      setError('Dataset ID is missing.')
      return
    }

    setRunning(true)
    setError(null)

    try {
      // هنا نرسل request للـ backend
      // const response = await fetch(`${API_BASE_URL}/saw/runs/${analysisRunId}/execute?ahp_run_id=${ahpRunId}`, {
      //   method: 'POST',
      //   headers: await getJsonHeaders(),
      // })
      // const results: SAWResult = await response.json()
      // setResults(results)

      // للتجربة: نحسب محلياً
      calculateSAW()

      // حفظ النتائج في localStorage
      localStorage.setItem(
        `saw_results_${datasetId}`,
        JSON.stringify({
          zones: zones,
          criteria: criteria,
          savedAt: new Date().toISOString(),
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run SAW analysis.')
    } finally {
      setRunning(false)
    }
  }

  async function handleExportCSV() {
    if (zones.length === 0) return

    const headers = ['Rank', 'Zone ID', 'Zone Name', 'SAW Score', ...criteria.map((c) => c.name)]

    const rows = zones.map((zone) => [
      zone.rank,
      zone.zone_id,
      zone.zone_name || '',
      zone.saw_score.toFixed(4),
      ...criteria.map((c) => (zone.criteria_values[c.id] || 0).toFixed(2)),
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `saw_results_${datasetId}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()

    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-gray-700">Loading SAW Analysis…</p>
      </main>
    )
  }

  if (error && criteria.length === 0) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <Link
          to={`/projects/${projectId}/wam-aggregation?datasetId=${datasetId ?? ''}`}
          className="text-blue-600 hover:underline"
        >
          ← Back to WAM Aggregation
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-red-700">Error</h1>
        <p className="mt-3 text-red-600">{error}</p>
      </main>
    )
  }

  return (
    <main className="max-w-7xl mx-auto p-8">
      <Link
        to={`/projects/${projectId}`}
        className="text-blue-600 hover:underline"
      >
        ← Back to project
      </Link>

      {/* Header */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          SAW Analysis (Simple Additive Weighting)
        </h1>

        <p className="mt-2 text-gray-600">
          Calculate final rankings using aggregated criteria weights.
        </p>

        <p className="mt-1 text-sm text-gray-500">
          Number of zones: <strong>{zones.length}</strong> | Number of criteria:{' '}
          <strong>{criteria.length}</strong>
        </p>
      </section>

      {/* Criteria Weights Summary */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Criteria Weights
        </h2>

        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Criterion</th>
                <th className="border p-2 text-left">Type</th>
                <th className="border p-2 text-left">Weight</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="border p-2">
                    {c.name} ({c.code})
                  </td>
                  <td className="border p-2">
                    <span className={c.type === 'benefit' ? 'text-green-600' : 'text-red-600'}>
                      {c.type === 'benefit' ? 'Benefit' : 'Cost'}
                    </span>
                  </td>
                  <td className="border p-2 font-mono">{c.weight.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Action Buttons */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <div className="flex gap-4">
          <button
            onClick={handleRunSAW}
            disabled={running || zones.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {running ? 'Running SAW…' : 'Run SAW Analysis'}
          </button>

          {zones.length > 0 && zones[0].saw_score > 0 && (
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Export Results (CSV)
            </button>
          )}
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}
      </section>

      {/* Results */}
      {zones.length > 0 && zones[0].saw_score > 0 && (
        <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            SAW Results - Zone Rankings
          </h2>

          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-center">Rank</th>
                  <th className="border p-2 text-left">Zone ID</th>
                  <th className="border p-2 text-left">Zone Name</th>
                  <th className="border p-2 text-left">SAW Score</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr
                    key={zone.zone_id}
                    className={`hover:bg-gray-50 ${
                      zone.rank <= 3 ? 'bg-yellow-50' : ''
                    }`}
                  >
                    <td className="border p-2 text-center font-bold">
                      {zone.rank}
                      {zone.rank <= 3 && ' 🏆'}
                    </td>
                    <td className="border p-2">{zone.zone_id}</td>
                    <td className="border p-2">{zone.zone_name || '—'}</td>
                    <td className="border p-2 font-mono font-bold text-blue-700">
                      {zone.saw_score.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Top 3 zones are highlighted. Export full results to CSV for detailed analysis.
          </p>
        </section>
      )}

      {/* Info Box */}
      <section className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900">
          ℹ️ How SAW Works
        </h3>

        <div className="mt-3 text-sm text-blue-800">
          <p>
            <strong>Simple Additive Weighting (SAW)</strong> calculates a weighted sum
            of normalized criterion values for each alternative.
          </p>
          <ol className="mt-3 list-decimal list-inside space-y-1">
            <li>Normalize criterion values (0-1 scale).</li>
            <li>For benefit criteria: use normalized value directly.</li>
            <li>For cost criteria: use (1 - normalized value).</li>
            <li>Multiply by criterion weight and sum.</li>
            <li>Rank alternatives by total score (higher is better).</li>
          </ol>
        </div>
      </section>
    </main>
  )
}