import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'

import UploadDatasetModal from '../components/UploadDatasetModal'
import { api, Project, RawDataset } from '../services/api'

export default function ProjectDetails() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [datasets, setDatasets] = useState<RawDataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProjectDetails() {
      if (!projectId) {
        setError('Project ID is missing from the URL.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // أولاً: نتحقق أن المشروع يظهر فعلاً في API.
        const projects = await api.getProjects()

        console.log('Projects returned by API:', projects)
        console.log('Project ID from URL:', projectId)

        const selectedProject = projects.find(
          (item) => item.id === projectId,
        )

        if (!selectedProject) {
          setError(
            `Project not found in the API response. Requested ID: ${projectId}`,
          )
          return
        }

        setProject(selectedProject)

        // ثانياً: نجلب datasets بعد التأكد من المشروع.
        const projectDatasets = await api.getProjectDatasets(projectId)
        setDatasets(projectDatasets)
      } catch (err) {
        console.error('Unable to load project details:', err)

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load project details.',
        )
      } finally {
        setLoading(false)
      }
    }

    void loadProjectDetails()
  }, [projectId])

  function handleUploadSuccess(dataset: RawDataset) {
    setDatasets((currentDatasets) => [dataset, ...currentDatasets])
  }

  function handleSelectDataset(datasetId: string) {
    // الانتقال لصفحة اختيار المعايير
    navigate(`/projects/${projectId}/criteria?datasetId=${datasetId}`)
  }

  function handleManageDecisionMakers() {
    // الانتقال لصفحة صناع القرار
    navigate(`/projects/${projectId}/decision-makers`)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-gray-700">Loading project…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold text-red-700">
          Unable to open project
        </h1>

        <p className="mt-3 text-red-600">{error}</p>

        <Link
          to="/dashboard"
          className="inline-block mt-6 text-blue-600 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </main>
    )
  }

  if (!project || !projectId) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <p>Project information is unavailable.</p>

        <Link
          to="/dashboard"
          className="inline-block mt-6 text-blue-600 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="max-w-5xl mx-auto p-8">
      <Link
        to="/dashboard"
        className="text-blue-600 hover:underline"
      >
        ← Back to dashboard
      </Link>

      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          {project.name}
        </h1>

        <p className="mt-2 text-gray-600">
          {project.description || 'No description provided.'}
        </p>

        {project.objective && (
          <p className="mt-3 text-gray-700">
            <strong>Objective:</strong> {project.objective}
          </p>
        )}

        <p className="mt-3 text-sm text-gray-500">
          Status: {project.status}
        </p>
      </section>

      {/* Upload Dataset */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <UploadDatasetModal
          projectId={projectId}
          onUploadSuccess={handleUploadSuccess}
        />
      </section>

      {/* Uploaded Datasets */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Uploaded datasets
        </h2>

        {datasets.length === 0 ? (
          <p className="mt-3 text-gray-500">
            No dataset has been uploaded for this project yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full mt-4 border-collapse">
              <thead>
                <tr className="border-b text-left text-sm text-gray-600">
                  <th className="py-2 pr-4">File name</th>
                  <th className="py-2 pr-4">Rows</th>
                  <th className="py-2 pr-4">Columns</th>
                  <th className="py-2 pr-4">Size</th>
                  <th className="py-2">Uploaded at</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {datasets.map((dataset) => (
                  <tr key={dataset.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      {dataset.name || 'Unnamed file'}
                    </td>
                    <td className="py-3 pr-4">
                      {dataset.row_count ?? 0}
                    </td>
                    <td className="py-3 pr-4">
                      {dataset.column_count ?? 0}
                    </td>
                    <td className="py-3 pr-4">
                      {dataset.file_size_bytes
                        ? `${(dataset.file_size_bytes / 1024).toFixed(1)} KB`
                        : '—'}
                    </td>
                    <td className="py-3">
                      {new Date(dataset.created_at).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleSelectDataset(dataset.id)}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Select Criteria
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Decision Makers Section */}
      <section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Decision Makers
        </h2>

        <p className="mt-2 text-gray-600">
          Add and manage experts who will provide AHP pairwise comparisons.
        </p>

        <button
          onClick={handleManageDecisionMakers}
          className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Manage Decision Makers
        </button>
      </section>

      {/* Quick Actions */}
<section className="mt-6 bg-white border rounded-lg p-6 shadow-sm">
  <h2 className="text-xl font-semibold text-gray-900">
    Quick Analysis
  </h2>

  <div className="mt-4 flex gap-4">
    <button
      onClick={() =>
        navigate(`/projects/${projectId}/decision-makers`)
      }
      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
    >
      AHP (Multi-Expert)
    </button>

    <button
      onClick={() => {
        if (datasets.length === 0) {
          setError('Please upload a dataset first.')
          return
        }
        navigate(`/projects/${projectId}/criteria?datasetId=${datasets[0].id}`)
      }}
      className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
    >
      WAM (Quick Weights)
    </button>
  </div>
</section>
    </main>
  )
}