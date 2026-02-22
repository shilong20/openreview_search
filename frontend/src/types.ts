export interface VenueStatus {
  fetched: boolean
  indexed: boolean
}

export interface Venue {
  name: string
  display_name: string
  min_year: number
  status: Record<string, VenueStatus>
}

export interface Paper {
  id: string
  title: string
  title_zh: string
  authors: string[]
  abstract: string
  abstract_zh: string
  keywords: string[]
  venue: string
  year: number
  decision: string
  pdf_url: string
  forum_url: string
  relevance_score: number
  relevance_reason: string
  rrf_score: number
  search_source: string
}

export interface SearchResult {
  papers: Paper[]
  keywords: string[]
  expanded_keywords: string[]
  total_candidates: number
}

export interface SearchHistoryItem {
  id: string
  created_at: string
  venue: string
  year: number
  description: string
  result: SearchResult
}

export interface JobStatus {
  status: 'not_started' | 'running' | 'done' | 'error' | 'already_running'
  progress?: number
  total?: number
  message?: string
  cached?: boolean
  indexed?: boolean
  metadata?: {
    total_papers: number
    fetch_date: string
    file_size_mb: number
  }
  result?: {
    total: number
    venue: string
    year: number
  }
}
