import type { Venue, SearchResult, MultiSearchResult, SearchProgress, JobStatus } from './types'

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

async function sseRequest<T>(
  path: string,
  body: unknown,
  onProgress?: (progress: SearchProgress) => void,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let result: T | null = null

  function processEvents(raw: string) {
    const blocks = raw.split(/\n\n/)
    for (const block of blocks) {
      if (!block.trim()) continue
      let eventType = ''
      let dataLines: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          dataLines.push(line.slice(6))
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5))
        }
      }
      if (dataLines.length === 0) continue
      const data = dataLines.join('\n')
      try {
        const parsed = JSON.parse(data)
        if (eventType === 'progress' && onProgress) {
          onProgress(parsed as SearchProgress)
        } else if (eventType === 'result') {
          result = parsed as T
        } else if (eventType === 'error') {
          throw new Error(parsed.message || 'Search failed')
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lastDoubleNewline = buffer.lastIndexOf('\n\n')
    if (lastDoubleNewline !== -1) {
      const complete = buffer.slice(0, lastDoubleNewline + 2)
      buffer = buffer.slice(lastDoubleNewline + 2)
      processEvents(complete)
    }
  }
  if (buffer.trim()) {
    processEvents(buffer)
  }

  if (!result) throw new Error('No result received from server')
  return result
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

  search: (
    params: {
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
    },
    onProgress?: (progress: SearchProgress) => void,
  ) => sseRequest<SearchResult>('/search', params, onProgress),

  multiSearch: (
    params: {
      research_description: string
      venues?: { venue: string; year: number }[]
      auto_latest?: boolean
      top_k?: number
      max_concurrent?: number
      use_llm_eval?: boolean
      use_chinese_relevance_reason?: boolean
      use_bilingual_translation?: boolean
    },
    onProgress?: (progress: SearchProgress) => void,
  ) => sseRequest<MultiSearchResult>('/multi-search', params, onProgress),
}
