import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api, Project } from '../services/api'
import { supabase } from '../services/supabase'


export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')

  const navigate = useNavigate()


  useEffect(() => {
    async function initializeDashboard() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        navigate('/login', { replace: true })
        return
      }

      await fetchProjects()
    }

    void initializeDashboard()
  }, [navigate])


  async function fetchProjects() {
  try {
    setLoading(true)
    setError(null)

    console.log('=== DASHBOARD: Requesting projects ===')

    const data = await api.getProjects()

    console.log('=== DASHBOARD: Projects received ===', data)
    console.log(
      '=== DASHBOARD: Project IDs ===',
      data.map((project) => project.id),
    )

    setProjects(data)
  } catch (err) {
    console.error('=== DASHBOARD: Failed to fetch projects ===', err)

    setError(
      err instanceof Error
        ? err.message
        : 'Failed to load projects.',
    )
  } finally {
    setLoading(false)
  }
}


  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = newProjectName.trim()
    const description = newProjectDescription.trim()

    if (name.length < 3) {
      setError('Project name must contain at least 3 characters.')
      return
    }

    try {
      setError(null)

      const createdProject = await api.createProject({
        name,
        description: description || undefined,
      })

      setProjects((currentProjects) => [
        createdProject,
        ...currentProjects,
      ])

      setShowCreateForm(false)
      setNewProjectName('')
      setNewProjectDescription('')

      // فتح صفحة المشروع الجديد مباشرة بعد إنشائه.
      navigate(`/projects/${createdProject.id}`)
    } catch (err) {
      console.error('Failed to create project:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create project.',
      )
    }
  }


  async function handleDeleteProject(projectId: string) {
    const shouldDelete = window.confirm(
      'Are you sure you want to delete this project? This action cannot be undone.',
    )

    if (!shouldDelete) {
      return
    }

    try {
      setError(null)

      await api.deleteProject(projectId)

      setProjects((currentProjects) =>
        currentProjects.filter((project) => project.id !== projectId),
      )
    } catch (err) {
      console.error('Failed to delete project:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to delete project.',
      )
    }
  }


  async function handleLogout() {
    await supabase.auth.signOut()
    localStorage.removeItem('supabase_session')
    navigate('/login', { replace: true })
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl text-gray-700">Loading projects…</div>
      </div>
    )
  }


  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Hospital Site Selection Projects
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Logout
          </button>
        </div>
      </header>


      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div
            role="alert"
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
          >
            {error}
          </div>
        )}


        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">My Projects</h2>

            <button
              type="button"
              onClick={() => {
                setShowCreateForm(true)
                setError(null)
              }}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              + New Project
            </button>
          </div>


          {showCreateForm && (
            <form
              onSubmit={handleCreateProject}
              className="bg-gray-50 p-4 rounded-lg mb-4"
            >
              <label
                htmlFor="project-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Project name
              </label>

              <input
                id="project-name"
                type="text"
                placeholder="Example: Swiss Hospital Site Selection"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded mb-3"
                required
                minLength={3}
                maxLength={150}
              />


              <label
                htmlFor="project-description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Description (optional)
              </label>

              <input
                id="project-description"
                type="text"
                placeholder="Short project description"
                value={newProjectDescription}
                onChange={(event) =>
                  setNewProjectDescription(event.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded mb-3"
              />


              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                >
                  Create and open
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewProjectName('')
                    setNewProjectDescription('')
                  }}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}


          {projects.length === 0 ? (
            <p className="text-gray-500">
              No projects yet. Create your first project.
            </p>
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => (
                <article
                  key={project.id}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {project.name}
                      </h3>

                      <p className="text-gray-600 mt-1">
                        {project.description || 'No description'}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded text-sm ${
                            project.status === 'draft'
                              ? 'bg-gray-200 text-gray-700'
                              : project.status === 'active'
                                ? 'bg-green-200 text-green-700'
                                : 'bg-yellow-200 text-yellow-700'
                          }`}
                        >
                          {project.status}
                        </span>

                        <span className="text-sm text-gray-500">
                          Created:{' '}
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>


                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/projects/${project.id}`)}
                        className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 text-sm"
                      >
                        Open project
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteProject(project.id)}
                        className="border border-red-300 text-red-600 px-3 py-2 rounded hover:bg-red-50 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}