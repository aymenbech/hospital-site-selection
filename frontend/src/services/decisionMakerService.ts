import { supabase } from './supabase'

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

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

async function ensureSuccess(response: Response): Promise<void> {
  if (!response.ok) {
    const body = await response.json()
    throw new Error(body.detail || `Request failed with status ${response.status}.`)
  }
}

export interface DecisionMaker {
  id: string
  project_id: string
  name: string
  email: string | null
  role: string | null
  created_at: string
}

export interface ExpertComparison {
  id: string
  decision_maker_id: string
  analysis_run_id: string
  criterion_i_id: string
  criterion_j_id: string
  comparison_value: string
  created_at: string
}

export interface AggregatedWeightsResponse {
  analysis_run_id: string
  aggregation_method: string
  weights: {
    criterion_id: string
    weight: string
  }[]
}

export const decisionMakerService = {
  async createDecisionMaker(
    projectId: string,
    name: string,
    email?: string,
    role?: string,
  ): Promise<DecisionMaker> {
    const headers = await getJsonHeaders()

    const response = await fetch(`${API_BASE_URL}/decision-makers/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        project_id: projectId,
        name,
        email: email || null,
        role: role || null,
      }),
    })

    await ensureSuccess(response)

    return response.json()
  },

  async getProjectDecisionMakers(projectId: string): Promise<DecisionMaker[]> {
    const headers = await getJsonHeaders()

    const response = await fetch(
      `${API_BASE_URL}/decision-makers/project/${projectId}`,
      {
        method: 'GET',
        headers,
      },
    )

    await ensureSuccess(response)

    return response.json()
  },

  async createExpertComparison(
    decisionMakerId: string,
    analysisRunId: string,
    criterionIId: string,
    criterionJId: string,
    comparisonValue: number,
  ): Promise<ExpertComparison> {
    const headers = await getJsonHeaders()

    const response = await fetch(`${API_BASE_URL}/decision-makers/comparisons`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        decision_maker_id: decisionMakerId,
        analysis_run_id: analysisRunId,
        criterion_i_id: criterionIId,
        criterion_j_id: criterionJId,
        comparison_value: comparisonValue.toString(),
      }),
    })

    await ensureSuccess(response)

    return response.json()
  },

  async getAggregatedWeights(
    analysisRunId: string,
    method: 'average' | 'median' = 'average',
  ): Promise<AggregatedWeightsResponse> {
    const headers = await getJsonHeaders()

    const response = await fetch(
      `${API_BASE_URL}/decision-makers/aggregate-weights/${analysisRunId}?method=${method}`,
      {
        method: 'GET',
        headers,
      },
    )

    await ensureSuccess(response)

    return response.json()
  },
}