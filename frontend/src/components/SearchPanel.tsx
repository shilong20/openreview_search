import { useEffect, useState, useRef } from 'react'
import { Search, Settings, Loader2, Globe } from 'lucide-react'
import type { Venue, SearchResult, MultiSearchResult } from '../types'
import { api } from '../api'
import { MultiSearchPanel } from './MultiSearchPanel'

type SearchMode = 'single' | 'multi'

interface Props {
  venues: Venue[]
  onResults: (result: SearchResult, venue: string, year: number, description: string) => void
  onMultiResults: (result: MultiSearchResult, description: string) => void
}

const BILINGUAL_TRANSLATION_KEY = 'paper_search_use_bilingual_translation_v1'
const CHINESE_REASON_KEY = 'paper_search_use_chinese_relevance_reason_v1'

export function SearchPanel({ venues, onResults, onMultiResults }: Props) {
  const [searchMode, setSearchMode] = useState<SearchMode>('single')
  const [venue, setVenue] = useState('')
  const [year, setYear] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [topK, setTopK] = useState(10)
  const [useLLM, setUseLLM] = useState(true)
  const [useBilingualTranslation, setUseBilingualTranslation] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(BILINGUAL_TRANSLATION_KEY)
      if (!raw) return true
      return raw === 'true'
    } catch {
      return true
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

  const [customYear, setCustomYear] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const customInputRef = useRef<HTMLInputElement>(null)

  const currentVenue = venues.find(v => v.name === venue)
  const yearStatus = venue && year ? currentVenue?.status?.[String(year)] : null
  const canSearch = venue && year > 0 && description.trim().length >= 3 && yearStatus?.fetched

  const minYear = currentVenue?.min_year ?? 2024
  const thisYear = new Date().getFullYear()
  const defaultYears = minYear <= thisYear
    ? Array.from({ length: thisYear - minYear + 1 }, (_, i) => thisYear - i)
    : [minYear]
  const knownYears = currentVenue
    ? Object.keys(currentVenue.status).map(Number)
    : []
  const selectableYears = Array.from(new Set([...knownYears, ...defaultYears]))
    .sort((a, b) => b - a)
  const yearSelectValue = year || selectableYears[0] || ''

  useEffect(() => {
    if (!venue && venues.length > 0) {
      setVenue(venues[0].name)
    }
  }, [venue, venues])

  useEffect(() => {
    if (!venue || year > 0 || showCustomInput || selectableYears.length === 0) {
      return
    }
    setYear(selectableYears[0])
  }, [venue, year, showCustomInput, selectableYears])

  useEffect(() => {
    try {
      localStorage.setItem(BILINGUAL_TRANSLATION_KEY, String(useBilingualTranslation))
    } catch {
      // ignore storage errors
    }
  }, [useBilingualTranslation])

  useEffect(() => {
    try {
      localStorage.setItem(CHINESE_REASON_KEY, String(useChineseReason))
    } catch {
      // ignore storage errors
    }
  }, [useChineseReason])

  const handleYearSelect = (val: string) => {
    if (val === '__custom__') {
      setShowCustomInput(true)
      setYear(0)
      setTimeout(() => customInputRef.current?.focus(), 50)
    } else {
      setShowCustomInput(false)
      setCustomYear('')
      setYear(Number(val))
    }
  }

  const handleCustomYearConfirm = () => {
    const y = parseInt(customYear, 10)
    if (isNaN(y) || y < minYear || y > 2100) return
    setYear(y)
    setShowCustomInput(false)
  }

  const handleSearch = async () => {
    if (!canSearch) return
    setLoading(true)
    setError('')
    try {
      const result = await api.search({
        venue,
        year,
        research_description: description.trim(),
        top_k: topK,
        use_llm_eval: useLLM,
        use_bilingual_translation: useBilingualTranslation,
        use_chinese_relevance_reason: useChineseReason,
      })
      onResults(result, venue, year, description.trim())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Search className="w-5 h-5 text-indigo-500" />
        Search Papers
      </h2>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
        <button
          onClick={() => setSearchMode('single')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            searchMode === 'single'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Search className="w-3 h-3" />
          Single Venue
        </button>
        <button
          onClick={() => setSearchMode('multi')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            searchMode === 'multi'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Globe className="w-3 h-3" />
          Multi Venue
        </button>
      </div>

      {searchMode === 'multi' ? (
        <MultiSearchPanel venues={venues} onResults={onMultiResults} />
      ) : (
      <>
      {/* Conference + Year */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Conference</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={venue}
            onChange={e => { setVenue(e.target.value); setYear(0); setShowCustomInput(false); setCustomYear('') }}
          >
            <option value="">Select conference</option>
            {venues.map(v => (
              <option key={v.name} value={v.name}>{v.display_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
          {showCustomInput ? (
            <div className="flex gap-1">
              <input
                ref={customInputRef}
                type="number"
                min={minYear}
                max={2100}
                placeholder={`${minYear}+`}
                value={customYear}
                onChange={e => setCustomYear(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomYearConfirm()}
                className="flex-1 border border-indigo-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={handleCustomYearConfirm}
                disabled={!customYear}
                className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40"
              >
                OK
              </button>
              <button
                onClick={() => { setShowCustomInput(false); setCustomYear('') }}
                className="px-2 py-2 text-gray-500 hover:text-gray-700 text-sm"
              >
                ✕
              </button>
            </div>
          ) : (
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={yearSelectValue}
              onChange={e => handleYearSelect(e.target.value)}
              disabled={!venue || selectableYears.length === 0}
            >
              {selectableYears.map((y: number) => (
                <option key={y} value={y}>{y}</option>
              ))}
              <option value="__custom__">＋ Add year ({minYear}+)…</option>
            </select>
          )}
        </div>
      </div>

      {/* Status hint */}
      {venue && year > 0 && (
        <div className="mb-4">
          {!yearStatus?.fetched && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              ⚠ Papers not fetched yet. Go to Data Manager to fetch first.
            </p>
          )}
          {yearStatus?.fetched && !yearStatus?.indexed && (
            <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
              ℹ Vector index not built. Keyword search only (no semantic search). Build index for better results.
            </p>
          )}
          {yearStatus?.fetched && yearStatus?.indexed && (
            <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
              ✓ Ready for hybrid search (vector + keyword)
            </p>
          )}
        </div>
      )}

      {/* Research description */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Research Interests
        </label>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          rows={4}
          placeholder="Describe your research interests in natural language, e.g. 'I am interested in efficient training methods for large language models, especially parameter-efficient fine-tuning and quantization techniques.'"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <div className="text-xs text-gray-400 mt-1 text-right">{description.length} chars</div>
      </div>

      {/* Advanced options */}
      <div className="mb-4">
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
                Top K results: {topK}
              </label>
              <input
                type="range"
                min={10}
                max={100}
                step={10}
                value={topK}
                onChange={e => setTopK(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useLLM"
                checked={useLLM}
                onChange={e => setUseLLM(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="useLLM" className="text-xs text-gray-600">
                LLM relevance scoring
                <span className="block text-gray-400">More accurate but slower</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useChineseReason"
                checked={useChineseReason}
                onChange={e => setUseChineseReason(e.target.checked)}
                className="rounded"
                disabled={!useLLM}
              />
              <label htmlFor="useChineseReason" className={`text-xs ${useLLM ? 'text-gray-600' : 'text-gray-400'}`}>
                Relevance reason in Chinese
                <span className="block text-gray-400">Control LLM reason language in prompt</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useBilingualTranslation"
                checked={useBilingualTranslation}
                onChange={e => setUseBilingualTranslation(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="useBilingualTranslation" className="text-xs text-gray-600">
                Bilingual title/abstract (ZH + EN)
                <span className="block text-gray-400">Translate top-k results to Chinese</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
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
            {`Searching${useLLM ? ' & Evaluating' : ''}${useBilingualTranslation ? ' & Translating' : ''}...`}
          </>
        ) : (
          <>
            <Search className="w-4 h-4" />
            Search
          </>
        )}
      </button>
      </>
      )}
    </div>
  )
}
