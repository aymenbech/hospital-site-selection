import { useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

/**
 * Legacy route kept only so old bookmarks do not break.
 * SAW is not part of the final methodology.
 */
export default function SAWAnalysis() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const datasetId = searchParams.get('datasetId')

  useEffect(() => {
    if (projectId) {
      navigate(`/projects/${projectId}/wam-aggregation?datasetId=${datasetId ?? ''}`, { replace: true })
    }
  }, [projectId, datasetId, navigate])

  return (
    <main className="max-w-3xl mx-auto p-8">
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">SAW is no longer used</h1>
        <p className="mt-3 text-gray-600">
          The final methodology is AHP → per-expert WAM → arithmetic mean across experts → final ranking.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Redirecting to the final WAM ranking workflow…
        </p>
        {projectId && (
          <Link
            className="mt-5 inline-block text-blue-600 hover:underline"
            to={`/projects/${projectId}/wam-aggregation?datasetId=${datasetId ?? ''}`}
          >
            Go to WAM ranking
          </Link>
        )}
      </section>
    </main>
  )
}
