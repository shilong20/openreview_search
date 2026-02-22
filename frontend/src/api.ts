import type { Venue, SearchResult, JobStatus } from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  getVenues: () => request<Venue[]>('/venues'),

  fetchPapers: (venue: string, year: number, force = false) =>
    request<{ job_id: string; status: string }>('/fetch', {
      method: 'POST',
      body: JSON.stringify({ venue, year, force }),
    }),

  getFetchStatus: (venue: string, year: number) =>
    request<JobStatus>(`/fetch/${venue}/${year}/status`),

  buildIndex: (venue: string, year: number, force = false) =>
    request<{ job_id: string; status: string }>('/index', {
      method: 'POST',
      body: JSON.stringify({ venue, year, force }),
    }),

  getIndexStatus: (venue: string, year: number) =>
    request<JobStatus>(`/index/${venue}/${year}/status`),

  search: (params: {
    venue: string
    year: number
    research_description: string
    top_k?: number
    max_concurrent?: number
    use_llm_eval?: boolean
    use_bilingual_translation?: boolean
    use_chinese_relevance_reason?: boolean
    vector_weight?: number
    keyword_weight?: number
  }) =>
    request<SearchResult>('/search', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
}
