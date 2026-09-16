import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import type { Criterion } from './CriteriaSelection'

interface ComparisonMatrix {
  [rowId: string]: {
    [columnId: string]: number
  }
}

interface Weight {
  criterion_id: string
  criterion_name: string
  weight: number
}

const RANDOM_INDEX: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0.58,
  4: 0.9,
  5: 1.12,
  6: 1.24,
  7: 1.32,
  8: 1.41,
  9: 1.45,
  10: 1.49,
}

const SAATY_SCALE = [
  { value: 1, label: '1 - Equal importance' },
  { value: 2, label: '2' },
  { value: 3, label: '3 - Moderate importance' },
  { value: 4, label: '4' },
  { value: 5, label: '5 - Strong importance' },
  { value: 6, label: '6' },
  { value: 7, label: '7 - Very strong importance' },
  { value: 8, label: '8' },
  { value: 9, label: '9 - Extreme importance' },
]

const RECIPROCAL_SCALE = [
  { value: 1/2, label: '1/2' },
  { value: 1/3, label: '1/3' },
  { value: 1/4, label: '1/4' },
  { value: 1/5, label: '1/5' },
  { value: 1/6, label: '1/6' },
  { value: 1/7, label: '1/7' },
  { value: 1/8, label: '1/8' },
  { value: 1/9, label: '1/9' },
]

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
    function loadCriteria() {
      if (!datasetId) {
        setError('Dataset ID is missing from the URL.')
        setLoading(false)
        return
      }

      try {
        const storedCriteria = localStorage.getItem(`criteria_${datasetId}`)

        if (!storedCriteria) {
          setError('No criteria found. Please select criteria first.')
          setLoading(false)
          return
        }

        const parsedCriteria = JSON.parse(storedCriteria) as Criterion[]

        if (parsedCriteria.length < 2) {
          setError('AHP requires at least two criteria.')
          setLoading(false)
          return
        }

        setCriteria(parsedCriteria)

        const savedMatrix = expertId
          ? localStorage.getItem(`ahp_matrix_${datasetId}_${expertId}`)
          : null

        if (savedMatrix) {
          const parsedSavedMatrix = JSON.parse(savedMatrix) as {
            matrix?: ComparisonMatrix
            expertName?: string
          }

          if (parsedSavedMatrix.matrix) {
            setMatrix(parsedSavedMatrix.matrix)
          }

          if (parsedSavedMatrix.expertName) {
            setExpertName(parsedSavedMatrix.expertName)
          }
        } else {
          const initialMatrix: ComparisonMatrix = {}

          parsedCriteria.forEach((rowCriterion) => {
            initialMatrix[rowCriterion.id] = {}

            parsedCriteria.forEach((columnCriterion) => {
              initialMatrix[rowCriterion.id][columnCriterion.id] = 1
            })
          })

          setMatrix(initialMatrix)
        }

        if (expertId) {
          setExpertName(`Expert ${expertId.slice(0, 8)}`)
        } else {
          setExpertName('Default decision maker')
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load selected criteria.',
        )
      } finally {
        setLoading(false)
      }
    }

    loadCriteria()
  }, [datasetId, expertId])

  useEffect(() => {
    if (criteria.length < 3 || Object.keys(matrix).length === 0) {
      setCr(0)
      setLambdaMax(null)
      setWeights([])
      return
    }

    const criterionIds = criteria.map((criterion) => criterion.id)
    const size = criterionIds.length

    // Column sums
    const columnSums = criterionIds.map((columnId) =>
      criterionIds.reduce(
        (sum, rowId) => sum + (matrix[rowId]?.[columnId] ?? 1),
        0,
      ),
    )

    // Priority vector (normalized)
    const priorityVector = criterionIds.map((rowId) => {
      const normalizedRowSum = criterionIds.reduce((sum, columnId, index) => {
        const matrixValue = matrix[rowId]?.[columnId] ?? 1
        const columnSum = columnSums[index]

        return sum + matrixValue / columnSum
      }, 0)

      return normalizedRowSum / size
    })

    // Weighted sum vector
    const weightedSumVector = criterionIds.map((rowId) =>
      criterionIds.reduce((sum, columnId, index) => {
        const matrixValue = matrix[rowId]?.[columnId] ?? 1
        return sum + matrixValue * priorityVector[index]
      }, 0),
    )

    // Lambda max
    const calculatedLambdaMax =
      weightedSumVector.reduce((sum, weightedSum, index) => {
        const priority = priorityVector[index]

        if (priority === 0) {
          return sum
        }

        return sum + weightedSum / priority
      }, 0) / size

    setLambdaMax(calculatedLambdaMax)

    // CI & CR
    const consistencyIndex = (calculatedLambdaMax - size) / (size - 1)
    const randomIndex = RANDOM_INDEX[size] ?? 1.49
    const consistencyRatio = randomIndex === 0 ? 0 : consistencyIndex / randomIndex

    setCr(Math.max(0, consistencyRatio))

    // Set weights
    const calculatedWeights: Weight[] = criterionIds.map((id, index) => {
      const criterion = criteria.find((c) => c.id === id)!
      return {
        criterion_id: id,
        criterion_name: `${criterion.name} (${criterion.code})`,
        weight: priorityVector[index],
      }
    })

    setWeights(calculatedWeights)
  }, [criteria, matrix])

  function handleComparisonChange(
    rowCriterionId: string,
    columnCriterionId: string,
    value: number,
  ) {
    if (!Number.isFinite(value) || value <= 0) {
      return
    }

    setMatrix((currentMatrix) => ({
      ...currentMatrix,
      [rowCriterionId]: {
        ...currentMatrix[rowCriterionId],
        [columnCriterionId]: value,
      },
      [columnCriterionId]: {
        ...currentMatrix[columnCriterionId],
        [rowCriterionId]: 1 / value,
      },
    }))
  }

  function handleExpertNameChange(newName: string) {
    setExpertName(newName)
  }

  async function handleSave() {
    if (!datasetId) {
      setError('Dataset ID is missing from the URL.')
      return
    }

    if (!expertId) {
      setError('Decision maker ID is missing from the URL.')
      return
    }

    if (cr !== null && cr > 0.1) {
      setError(
        `Consistency Ratio is too high (${cr.toFixed(
          4,
        )}). It must be less than or equal to 0.1.`,
      )
      return
    }

    setSaving(true)
    setError(null)

    try {
      localStorage.setItem(
        `ahp_matrix_${datasetId}_${expertId}`,
        JSON.stringify({
          criteria,
          matrix,
          weights,
          lambdaMax,
          consistencyRatio: cr,
          expertName,
          savedAt: new Date().toISOString(),
        }),
      )

      navigate(`/projects/${projectId}/decision-makers?datasetId=${datasetId}`)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save the AHP comparison matrix.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-gray-700">Loading AHP matrix...</p>
      </main>
    )
  }

  if (error && criteria.length === 0) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <Link
          to={`/projects/${projectId}`}
          className="text-blue-600 hover:underline"
        >
          Back to project
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-red-700">Error</h1>
        <p className="mt-3 text-red-600">{error}</p>
      </main>
    )
  }

  const isConsistent = cr === null || cr <= 0.1

  return (
    <main className="mx-auto max-w-7xl p-8">
      <Link
        to={`/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`}
        className="text-blue-600 hover:underline"
      >
        Back to decision makers
      </Link>

      <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          AHP Pairwise Comparison Matrix
        </h1>

        <p className="mt-2 text-gray-600">
          Decision maker:{' '}
          <input
            type="text"
            value={expertName}
            onChange={(e) => handleExpertNameChange(e.target.value)}
            className="border rounded px-2 py-1 font-semibold"
            placeholder="Enter expert name"
          />
        </p>

        <p className="mt-2 text-sm text-gray-500">
          Compare each criterion in the upper half of the matrix. The reciprocal
          values are calculated automatically.
        </p>
      </section>

      {cr !== null && (
        <section
          className={`mt-6 rounded-lg border p-6 ${
            isConsistent
              ? 'border-green-200 bg-green-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <h2 className="text-xl font-semibold">
            Consistency Ratio (CR): {cr.toFixed(4)}
          </h2>

          {lambdaMax !== null && (
            <p className="mt-1 text-sm text-gray-700">
              λ_max: {lambdaMax.toFixed(4)}
            </p>
          )}

          {isConsistent ? (
            <p className="mt-2 text-green-700">
              The comparisons are acceptable: CR is less than or equal to 0.1.
            </p>
          ) : (
            <p className="mt-2 text-red-700">
              The comparisons are inconsistent: CR is greater than 0.1. Please
              revise the selected comparison values.
            </p>
          )}
        </section>
      )}

      {/* Weights Table */}
      {weights.length > 0 && (
        <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Calculated Weights
          </h2>

          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Criterion</th>
                  <th className="border p-2 text-left">Weight</th>
                </tr>
              </thead>
              <tbody>
                {weights.map((w) => (
                  <tr key={w.criterion_id} className="hover:bg-gray-50">
                    <td className="border p-2">{w.criterion_name}</td>
                    <td className="border p-2 font-mono">{w.weight.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Pairwise comparisons
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse border text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Criterion</th>

                {criteria.map((criterion) => (
                  <th
                    key={criterion.id}
                    className="min-w-[140px] border p-2 text-center"
                  >
                    {criterion.name}
                    <br />
                    <span className="text-xs font-normal text-gray-500">
                      ({criterion.code})
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {criteria.map((rowCriterion, rowIndex) => (
                <tr key={rowCriterion.id}>
                  <td className="border bg-gray-50 p-2 font-medium">
                    {rowCriterion.name}
                  </td>

                  {criteria.map((columnCriterion, columnIndex) => {
                    const isDiagonal = rowCriterion.id === columnCriterion.id
                    const isUpperTriangle = rowIndex < columnIndex
                    const value =
                      matrix[rowCriterion.id]?.[columnCriterion.id] ?? 1

                    return (
                      <td
                        key={`${rowCriterion.id}-${columnCriterion.id}`}
                        className="border p-2 text-center"
                      >
                        {isDiagonal ? (
                          <span className="text-gray-500">1</span>
                        ) : isUpperTriangle ? (
                          <select
                            value={value}
                            onChange={(event) =>
                              handleComparisonChange(
                                rowCriterion.id,
                                columnCriterion.id,
                                Number(event.target.value),
                              )
                            }
                            className="w-full rounded border px-2 py-1"
                          >
                            {SAATY_SCALE.map((scale) => (
                              <option key={scale.value} value={scale.value}>
                                {scale.label}
                              </option>
                            ))}
                            {RECIPROCAL_SCALE.map((scale) => (
                              <option key={scale.value} value={scale.value}>
                                {scale.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-600">
                            {value.toFixed(4)}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded border bg-gray-50 p-4">
          <h3 className="font-semibold text-gray-800">AHP scale</h3>
          <p className="mt-2 text-sm text-gray-600">
            1 = Equal, 3 = Moderate, 5 = Strong, 7 = Very strong, 9 = Extreme.
            Values 2, 4, 6, and 8 are intermediate judgments.
          </p>
        </div>

        <div className="mt-6 flex gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isConsistent}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {saving ? 'Saving...' : 'Save AHP Matrix'}
          </button>

          <button
            type="button"
            onClick={() =>
              navigate(
                `/projects/${projectId}/decision-makers?datasetId=${datasetId ?? ''}`,
              )
            }
            className="rounded bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}
      </section>
    </main>
  )
}