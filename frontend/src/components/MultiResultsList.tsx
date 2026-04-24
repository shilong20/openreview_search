import { useState } from 'react'
import {
  ExternalLink,
  FileText,
  ChevronDown,
  ChevronUp,
  Tag,
  AlertTriangle,
  LayoutGrid,
  List,
} from 'lucide-react'
import type { Paper, MultiSearchResult } from '../types'

interface Props {
  result: MultiSearchResult
  description: string
}

type ViewMode = 'grouped' | 'merged'

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.7 ? 'bg-green-500' : score >= 0.4 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-600 w-8 text-right">{pct}%</span>
    </div>
  )
}

function PaperCard({ paper, rank, showVenueBadge }: { paper: Paper; rank: number; showVenueBadge?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const displayTitleEn = paper.title?.trim() || paper.title_zh?.trim() || ''
  const displayTitleZh = paper.title_zh?.trim() || ''
  const displayAbstractZh = paper.abstract_zh?.trim() || paper.abstract
  const hasBilingualTitle = Boolean(displayTitleZh && displayTitleEn && displayTitleZh !== displayTitleEn)
  const hasBilingualAbstract = Boolean(displayAbstractZh && paper.abstract && displayAbstractZh !== paper.abstract)

  const decisionColor = () => {
    const d = paper.decision.toLowerCase()
    if (d.includes('oral')) return 'bg-purple-100 text-purple-700'
    if (d.includes('spotlight')) return 'bg-blue-100 text-blue-700'
    if (d.includes('poster') || d.includes('accept')) return 'bg-green-100 text-green-700'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center mt-0.5">
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">
            {displayTitleEn}
          </h3>
          {hasBilingualTitle && (
            <p className="text-xs text-gray-500 leading-snug mt-1 mb-2">{displayTitleZh}</p>
          )}
          {!hasBilingualTitle && <div className="mb-2" />}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${decisionColor()}`}>
              {paper.decision || 'N/A'}
            </span>
            {showVenueBadge && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                {paper.venue} {paper.year}
              </span>
            )}
            <span className="text-xs text-gray-400">
              {paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ` +${paper.authors.length - 3}` : ''}
            </span>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Relevance</span>
            </div>
            <ScoreBar score={paper.relevance_score} />
            {paper.relevance_reason && (
              <p className="text-xs text-gray-500 mt-1 italic">{paper.relevance_reason}</p>
            )}
          </div>

          {paper.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {paper.keywords.slice(0, 5).map(kw => (
                <span key={kw} className="inline-flex items-center gap-0.5 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  <Tag className="w-2.5 h-2.5" />
                  {kw}
                </span>
              ))}
            </div>
          )}

          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mb-1"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Hide' : 'Show'} abstract
            </button>
            {expanded && (
              <div className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-3 space-y-2">
                {displayAbstractZh ? (
                  <div>
                    <div className="text-[11px] text-indigo-600 mb-1">中文摘要</div>
                    <p>{displayAbstractZh}</p>
                  </div>
                ) : (
                  <p>No abstract available.</p>
                )}
                {hasBilingualAbstract && (
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">Original Abstract</div>
                    <p>{paper.abstract}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-3">
            {paper.forum_url && (
              <a
                href={paper.forum_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <ExternalLink className="w-3 h-3" />
                OpenReview
              </a>
            )}
            {paper.pdf_url && (
              <a
                href={paper.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <FileText className="w-3 h-3" />
                PDF
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VenueSection({ venue, selectedYear, papers, totalCandidates }: {
  venue: string
  selectedYear: number
  papers: Paper[]
  totalCandidates: number
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{venue}</span>
          <span className="text-xs text-gray-500">{selectedYear}</span>
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
            {papers.length} papers
          </span>
          <span className="text-xs text-gray-400">
            from {totalCandidates} candidates
          </span>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {papers.map((paper, i) => (
            <PaperCard key={paper.id} paper={paper} rank={i + 1} />
          ))}
          {papers.length === 0 && (
            <div className="text-center py-6 text-gray-400 text-sm">No papers found for this venue.</div>
          )}
        </div>
      )}
    </div>
  )
}

export function MultiResultsList({ result, description }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('grouped')

  const totalPapers = result.venues.reduce((sum, v) => sum + v.papers.length, 0)
  const successfulVenues = result.venues.filter(v => v.status === 'ok')

  const mergedPapers = viewMode === 'merged'
    ? result.venues
        .flatMap(v => v.papers)
        .sort((a, b) => b.relevance_score - a.relevance_score)
    : []

  return (
    <div>
      {/* Summary header */}
      <div className="mb-4 p-4 bg-indigo-50 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-indigo-800">
            {totalPapers} papers across {successfulVenues.length} venues for "{description.slice(0, 80)}{description.length > 80 ? '...' : ''}"
          </div>
          {/* View toggle */}
          <div className="flex gap-1 p-0.5 bg-indigo-100 rounded-md">
            <button
              onClick={() => setViewMode('grouped')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'grouped'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-indigo-500 hover:text-indigo-700'
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              Grouped
            </button>
            <button
              onClick={() => setViewMode('merged')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'merged'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-indigo-500 hover:text-indigo-700'
              }`}
            >
              <List className="w-3 h-3" />
              Merged
            </button>
          </div>
        </div>

        <div className="text-xs text-indigo-600">
          {result.summary.requested_venues} venues requested · {result.summary.successful_venues} succeeded · {result.summary.returned_papers} papers returned
        </div>

        {result.keywords.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-xs text-indigo-500 mr-1">Keywords:</span>
            {result.keywords.map(kw => (
              <span key={kw} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Failures */}
      {result.failures.length > 0 && (
        <div className="mb-4 space-y-2">
          {result.failures.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-700">
                <span className="font-medium">{f.venue}</span>: {f.reason} ({f.stage})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {viewMode === 'grouped' ? (
        <div className="space-y-4">
          {result.venues
            .filter(v => v.status === 'ok')
            .map(v => (
              <VenueSection
                key={v.venue}
                venue={v.venue}
                selectedYear={v.selected_year}
                papers={v.papers}
                totalCandidates={v.total_candidates}
              />
            ))}
        </div>
      ) : (
        <div className="space-y-3">
          {mergedPapers.map((paper, i) => (
            <PaperCard key={paper.id} paper={paper} rank={i + 1} showVenueBadge />
          ))}
        </div>
      )}

      {totalPapers === 0 && result.failures.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No papers found. Try different keywords or check if data is indexed.</p>
        </div>
      )}
    </div>
  )
}
