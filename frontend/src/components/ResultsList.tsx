import { useState } from 'react'
import { ExternalLink, FileText, ChevronDown, ChevronUp, Tag } from 'lucide-react'
import type { Paper, SearchResult } from '../types'

interface Props {
  result: SearchResult
  venue: string
  year: number
  description: string
}

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

function PaperCard({ paper, rank }: { paper: Paper; rank: number }) {
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
        {/* Rank badge */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center mt-0.5">
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">
            {displayTitleEn}
          </h3>
          {hasBilingualTitle && (
            <p className="text-xs text-gray-500 leading-snug mt-1 mb-2">
              {displayTitleZh}
            </p>
          )}
          {!hasBilingualTitle && <div className="mb-2" />}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${decisionColor()}`}>
              {paper.decision || 'N/A'}
            </span>
            <span className="text-xs text-gray-400">
              {paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ` +${paper.authors.length - 3}` : ''}
            </span>
          </div>

          {/* Relevance score */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Relevance</span>
            </div>
            <ScoreBar score={paper.relevance_score} />
            {paper.relevance_reason && (
              <p className="text-xs text-gray-500 mt-1 italic">{paper.relevance_reason}</p>
            )}
          </div>

          {/* Keywords */}
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

          {/* Abstract (collapsible) */}
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

          {/* Links */}
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

export function ResultsList({ result, venue, year, description }: Props) {
  return (
    <div>
      {/* Summary header */}
      <div className="mb-4 p-4 bg-indigo-50 rounded-xl">
        <div className="text-sm font-medium text-indigo-800 mb-1">
          {result.papers.length} papers ranked for "{description.slice(0, 80)}{description.length > 80 ? '…' : ''}"
        </div>
        <div className="text-xs text-indigo-600">
          {venue} {year} · {result.total_candidates} candidates searched
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

      {/* Paper list */}
      <div className="space-y-3">
        {result.papers.map((paper, i) => (
          <PaperCard key={paper.id} paper={paper} rank={i + 1} />
        ))}
      </div>

      {result.papers.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No papers found. Try different keywords or check if data is fetched.</p>
        </div>
      )}
    </div>
  )
}
