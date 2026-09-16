import { supabase } from './supabase'


const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'


export interface Project {
  id: string
  name: string
  description: string | null
  objective: string | null
  status: 'draft' | 'active' | 'archived'
  owner_id: string
  created_at: string
  updated_at: string
}


export interface RawDataset {
  id: string
  project_id: string
  name: string | null
  storage_path: string
  file_size_bytes: number | null
  row_count: number | null
  column_count: number | null
  uploaded_by: string | null
  created_at: string
}


export interface CreateProjectInput {
  name: string
  description?: string
  objective?: string
}


async function getAccessToken(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw new Error(`Unable to get authentication session: ${error.message}`)
  }

  if (!session?.access_token) {
    throw new Error('You must sign in before calling the API.')
  }

  return session.access_token
}


async function getJsonHeaders(): Promise<HeadersInit> {
  const accessToken = await getAccessToken()

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}


async function getMultipartHeaders(): Promise<HeadersInit> {
  const accessToken = await getAccessToken()

  return {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}


async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()

    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      return body.detail
    }

    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message
    }
  } catch {
    // Response body is not JSON; use the fallback below.
  }

  return `Request failed with status ${response.status}.`
}


async function ensureSuccess(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }
}


export const api = {
  async getProjects(): Promise<Project[]> {
    const headers = await getJsonHeaders()

    const response = await fetch(
      `${API_BASE_URL}/projects/?skip=0&limit=100`,
      {
        method: 'GET',
        headers,
      },
    )

    await ensureSuccess(response)

    const projects: Project[] = await response.json()

    console.log('Projects returned by Backend:', projects)

    return projects
  },


  async createProject(
    project: CreateProjectInput,
  ): Promise<Project> {
    const name = project.name.trim()

    if (name.length < 3) {
      throw new Error('Project name must contain at least 3 characters.')
    }

    const headers = await getJsonHeaders()

    const response = await fetch(`${API_BASE_URL}/projects/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name,
        description: project.description?.trim() || null,
        objective: project.objective?.trim() || null,
      }),
    })

    await ensureSuccess(response)

    return response.json()
  },


  async deleteProject(projectId: string): Promise<void> {
    const headers = await getJsonHeaders()

    const response = await fetch(
      `${API_BASE_URL}/projects/${projectId}`,
      {
        method: 'DELETE',
        headers,
      },
    )

    await ensureSuccess(response)
  },


  async uploadDataset(
    projectId: string,
    file: File,
  ): Promise<RawDataset> {
    if (!file) {
      throw new Error('Please select a CSV or XLSX file.')
    }

    const extension = file.name
      .slice(file.name.lastIndexOf('.'))
      .toLowerCase()

    if (!['.csv', '.xlsx'].includes(extension)) {
      throw new Error('Only CSV and XLSX files are allowed.')
    }

    const headers = await getMultipartHeaders()

    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(
      `${API_BASE_URL}/projects/${projectId}/datasets/upload`,
      {
        method: 'POST',
        headers,
        body: formData,
      },
    )

    await ensureSuccess(response)

    return response.json()
  },


  async getProjectDatasets(
    projectId: string,
  ): Promise<RawDataset[]> {
    const headers = await getJsonHeaders()

    const response = await fetch(
      `${API_BASE_URL}/projects/${projectId}/datasets`,
      {
        method: 'GET',
        headers,
      },
    )

    await ensureSuccess(response)

    return response.json()
  },
}