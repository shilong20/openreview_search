import { useState } from 'react'
import { Search, Settings, Loader2 } from 'lucide-react'
import type { Venue, SearchResult } from '../types'
import { api } from '../api'

interface Props {
  venues: Venue[]
  onResults: (result: SearchResult, venue: string, year: number, description: string) => void
}

export function SearchPanel({ venues, onResults }: Props) {
  const [venue, setVenue] = useState('')
  const [year, setYear] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [topK, setTopK] = useState(30)
  const [useLLM, setUseLLM] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const currentVenue = venues.find(v => v.name === venue)
  const yearStatus = venue && year ? currentVenue?.status?.[String(year)] : null
  const canSearch = venue && year > 0 && description.trim().length >= 3 && yearStatus?.fetched

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

      {/* Conference + Year */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Conference</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={venue}
            onChange={e => { setVenue(e.target.value); setYear(0) }}
          >
            <option value="">Select conference</option>
            {venues.map(v => (
              <option key={v.name} value={v.name}>{v.display_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            disabled={!venue}
          >
            <option value={0}>Select year</option>
            {currentVenue?.available_years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
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
          <div className="mt-3 grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
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
            Searching{useLLM ? ' & Evaluating' : ''}...
          </>
        ) : (
          <>
            <Search className="w-4 h-4" />
            Search
          </>
        )}
      </button>
    </div>
  )
}
