import { useState, useEffect, useRef } from 'react'
import { Search, Settings, Loader2, Zap, SlidersHorizontal } from 'lucide-react'
import type { Venue, MultiSearchResult, SearchProgress } from '../types'
import { api } from '../api'

interface Props {
  venues: Venue[]
  onResults: (result: MultiSearchResult, description: string) => void
}

type SubMode = 'auto' | 'custom'

const BILINGUAL_TRANSLATION_KEY = 'paper_search_use_bilingual_translation_v1'
const CHINESE_REASON_KEY = 'paper_search_use_chinese_relevance_reason_v1'

interface VenueYearOption {
  venue: string
  displayName: string
  year: number
  key: string
}

function getLatestIndexedYear(venue: Venue): number | null {
  const years = Object.entries(venue.status)
    .filter(([, s]) => s.indexed)
    .map(([y]) => Number(y))
    .sort((a, b) => b - a)
  return years[0] ?? null
}

function getAllIndexedVenueYears(venues: Venue[]): VenueYearOption[] {
  const options: VenueYearOption[] = []
  for (const v of venues) {
    const indexedYears = Object.entries(v.status)
      .filter(([, s]) => s.indexed)
      .map(([y]) => Number(y))
      .sort((a, b) => b - a)
    for (const y of indexedYears) {
      options.push({
        venue: v.name,
        displayName: v.display_name,
        year: y,
        key: `${v.name}_${y}`,
      })
    }
  }
  return options
}

export function MultiSearchPanel({ venues, onResults }: Props) {
  const [subMode, setSubMode] = useState<SubMode>('auto')
  const [description, setDescription] = useState('')
  const [topK, setTopK] = useState(25)
  const [useLLM, setUseLLM] = useState(true)
  const [useBilingualTranslation, setUseBilingualTranslation] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(BILINGUAL_TRANSLATION_KEY)
      if (!raw) return false
      return raw === 'true'
    } catch {
      return false
    }
  })
  const [useChineseReason, setUseChineseReason] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(CHINESE_REASON_KEY)
      if (!raw) return true
      return raw === 'true'
    } catch {
      return true
    }
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)

  useEffect(() => {
    if (!loading) {
      setElapsed(0)
      return
    }
    startRef.current = Date.now()
    setElapsed(0)
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [loading])

  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({})

  const indexedVenues = venues.filter(v => getLatestIndexedYear(v) !== null)
  const allVenueYears = getAllIndexedVenueYears(venues)

  useEffect(() => {
    const defaults: Record<string, boolean> = {}
    for (const v of indexedVenues) {
      const latestYear = getLatestIndexedYear(v)
      if (latestYear !== null) {
        const key = `${v.name}_${latestYear}`
        if (selectedKeys[key] === undefined) {
          defaults[key] = true
        }
      }
    }
    if (Object.keys(defaults).length > 0) {
      setSelectedKeys(prev => ({ ...defaults, ...prev }))
    }
  }, [venues])

  useEffect(() => {
    try {
      localStorage.setItem(BILINGUAL_TRANSLATION_KEY, String(useBilingualTranslation))
    } catch { /* ignore */ }
  }, [useBilingualTranslation])

  useEffect(() => {
    try {
      localStorage.setItem(CHINESE_REASON_KEY, String(useChineseReason))
    } catch { /* ignore */ }
  }, [useChineseReason])

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const getCustomVenuePairs = () => {
    return allVenueYears
      .filter(opt => selectedKeys[opt.key])
      .map(opt => ({ venue: opt.venue, year: opt.year }))
  }

  const selectedCount = getCustomVenuePairs().length

  const canSearch = description.trim().length >= 3 && (
    subMode === 'auto'
      ? indexedVenues.length > 0
      : selectedCount > 0
  )

  const handleSearch = async () => {
    if (!canSearch) return
    setLoading(true)
    setError('')
    setProgress(null)
    try {
      const params: Parameters<typeof api.multiSearch>[0] = {
        research_description: description.trim(),
        top_k: topK,
        use_llm_eval: useLLM,
        use_chinese_relevance_reason: useChineseReason,
        use_bilingual_translation: useBilingualTranslation,
      }

      if (subMode === 'auto') {
        params.auto_latest = true
      } else {
        params.auto_latest = false
        params.venues = getCustomVenuePairs()
      }

      const result = await api.multiSearch(params, (p) => setProgress(p))
      onResults(result, description.trim())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Sub-mode tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
        <button
          onClick={() => setSubMode('auto')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            subMode === 'auto'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Zap className="w-3 h-3" />
          One-Click
        </button>
        <button
          onClick={() => setSubMode('custom')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            subMode === 'custom'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Custom
        </button>
      </div>

      {/* Auto mode hint */}
      {subMode === 'auto' && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Automatically searches all indexed venues with their latest year.
          {indexedVenues.length > 0 ? (
            <span className="block mt-1 text-indigo-600">
              {indexedVenues.map(v => `${v.display_name} ${getLatestIndexedYear(v)}`).join(' · ')}
            </span>
          ) : (
            <span className="block mt-1 text-amber-600">
              No indexed venues. Go to Data Manager to fetch and index data.
            </span>
          )}
        </div>
      )}

      {/* Custom mode: venue+year selector */}
      {subMode === 'custom' && (
        <div className="space-y-2">
          {allVenueYears.length === 0 ? (
            <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              No indexed venues available. Go to Data Manager to fetch and index data.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{selectedCount} selected</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const all: Record<string, boolean> = {}
                      allVenueYears.forEach(opt => { all[opt.key] = true })
                      setSelectedKeys(all)
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setSelectedKeys({})}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 max-h-48 overflow-y-auto">
                {allVenueYears.map(opt => (
                  <label
                    key={opt.key}
                    className="flex items-center gap-2.5 px-1 py-0.5 rounded hover:bg-gray-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!!selectedKeys[opt.key]}
                      onChange={() => toggleKey(opt.key)}
                      className="rounded"
                    />
                    <span className="text-xs font-medium text-gray-700 w-20">{opt.displayName}</span>
                    <span className="text-xs text-gray-500">{opt.year}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Research description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Research Interests
        </label>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          rows={4}
          placeholder="Describe your research interests, e.g. 'efficient training methods for large language models, parameter-efficient fine-tuning and quantization techniques.'"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <div className="text-xs text-gray-400 mt-1 text-right">{description.length} chars</div>
      </div>

      {/* Advanced options */}
      <div>
        <button
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Settings className="w-3 h-3" />
          {showAdvanced ? 'Hide' : 'Show'} advanced options
        </button>

        {showAdvanced && (
          <div className="mt-3 grid grid-cols-1 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Top K results per venue: {topK}
              </label>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={topK}
                onChange={e => setTopK(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="multiUseLLM"
                checked={useLLM}
                onChange={e => setUseLLM(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="multiUseLLM" className="text-xs text-gray-600">
                LLM relevance scoring
                <span className="block text-gray-400">More accurate but slower</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="multiUseChineseReason"
                checked={useChineseReason}
                onChange={e => setUseChineseReason(e.target.checked)}
                className="rounded"
                disabled={!useLLM}
              />
              <label htmlFor="multiUseChineseReason" className={`text-xs ${useLLM ? 'text-gray-600' : 'text-gray-400'}`}>
                Relevance reason in Chinese
                <span className="block text-gray-400">Control LLM reason language in prompt</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="multiUseBilingualTranslation"
                checked={useBilingualTranslation}
                onChange={e => setUseBilingualTranslation(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="multiUseBilingualTranslation" className="text-xs text-gray-600">
                Bilingual title/abstract (ZH + EN)
                <span className="block text-gray-400">Translate top-k results to Chinese</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Search button */}
      <button
        onClick={handleSearch}
        disabled={!canSearch || loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Searching across venues...
          </>
        ) : (
          <>
            <Search className="w-4 h-4" />
            Search All Venues
          </>
        )}
      </button>

      {/* Progress hint */}
      {loading && (
        <div className="mt-2 space-y-1">
          <div className="text-center text-xs text-gray-500">
            <span className="font-mono text-indigo-600">
              {elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`}
            </span>
            {' · '}
            {progress ? (
              progress.stage === 'keywords' ? 'Extracting keywords...'
              : progress.stage === 'venue_start' ? `Searching ${progress.venue} ${progress.year}...`
              : progress.stage === 'eval' ? `${progress.venue} ${progress.year}: scoring ${progress.evaluated}/${progress.total}`
              : progress.stage === 'translate' ? `${progress.venue} ${progress.year}: translating ${progress.translated}/${progress.total}`
              : progress.stage === 'venue_done' ? `${progress.venue} ${progress.year}: done (${progress.papers} papers)`
              : 'Processing...'
            ) : (
              'Connecting...'
            )}
          </div>
        </div>
      )}
    </div>
  )
}
