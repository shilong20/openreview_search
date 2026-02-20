import { useState, useEffect, useCallback } from 'react'
import { Download, Database, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { api } from '../api'
import type { Venue, JobStatus } from '../types'

interface Props {
  venues: Venue[]
  onVenuesChange: () => void
}

export function DataManager({ venues, onVenuesChange }: Props) {
  const [selectedVenue, setSelectedVenue] = useState('')
  const [selectedYear, setSelectedYear] = useState<number>(0)
  const [fetchStatus, setFetchStatus] = useState<JobStatus | null>(null)
  const [indexStatus, setIndexStatus] = useState<JobStatus | null>(null)
  const [polling, setPolling] = useState(false)

  const currentVenue = venues.find(v => v.name === selectedVenue)
  const yearStatus = selectedVenue && selectedYear
    ? currentVenue?.status?.[String(selectedYear)]
    : null

  const pollStatus = useCallback(async () => {
    if (!selectedVenue || !selectedYear) return
    const [fs, is] = await Promise.all([
      api.getFetchStatus(selectedVenue, selectedYear),
      api.getIndexStatus(selectedVenue, selectedYear),
    ])
    setFetchStatus(fs)
    setIndexStatus(is)

    const stillRunning = fs.status === 'running' || is.status === 'running'
    if (!stillRunning) {
      setPolling(false)
      onVenuesChange()
    }
  }, [selectedVenue, selectedYear, onVenuesChange])

  useEffect(() => {
    if (!selectedVenue || !selectedYear) return
    pollStatus()
  }, [selectedVenue, selectedYear, pollStatus])

  useEffect(() => {
    if (!polling) return
    const timer = setInterval(pollStatus, 2000)
    return () => clearInterval(timer)
  }, [polling, pollStatus])

  const handleFetch = async () => {
    if (!selectedVenue || !selectedYear) return
    await api.fetchPapers(selectedVenue, selectedYear)
    setPolling(true)
    pollStatus()
  }

  const handleIndex = async () => {
    if (!selectedVenue || !selectedYear) return
    await api.buildIndex(selectedVenue, selectedYear)
    setPolling(true)
    pollStatus()
  }

  const StatusBadge = ({ status, label }: { status: JobStatus | null; label: string }) => {
    if (!status) return <span className="text-gray-400 text-sm">—</span>
    if (status.status === 'running') {
      return (
        <span className="flex items-center gap-1 text-blue-600 text-sm">
          <Loader2 className="w-3 h-3 animate-spin" />
          {status.message || 'Running...'}
          {status.total ? ` (${status.progress}/${status.total})` : ''}
        </span>
      )
    }
    if (status.status === 'done' || status.cached || status.indexed) {
      return (
        <span className="flex items-center gap-1 text-green-600 text-sm">
          <CheckCircle className="w-3 h-3" />
          {label === 'fetch' && status.metadata
            ? `${status.metadata.total_papers.toLocaleString()} papers`
            : 'Ready'}
        </span>
      )
    }
    if (status.status === 'error') {
      return (
        <span className="flex items-center gap-1 text-red-500 text-sm">
          <AlertCircle className="w-3 h-3" />
          {status.message || 'Error'}
        </span>
      )
    }
    return <span className="text-gray-400 text-sm">Not started</span>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Database className="w-5 h-5 text-indigo-500" />
        Data Manager
      </h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Conference</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={selectedVenue}
            onChange={e => { setSelectedVenue(e.target.value); setSelectedYear(0) }}
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
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            disabled={!selectedVenue}
          >
            <option value={0}>Select year</option>
            {currentVenue?.available_years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedVenue && selectedYear > 0 && (
        <div className="space-y-4">
          {/* Fetch step */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Step 1: Fetch Papers</div>
              <StatusBadge status={fetchStatus} label="fetch" />
            </div>
            <button
              onClick={handleFetch}
              disabled={fetchStatus?.status === 'running' || polling}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {fetchStatus?.status === 'running'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : yearStatus?.fetched
                  ? <RefreshCw className="w-4 h-4" />
                  : <Download className="w-4 h-4" />
              }
              {yearStatus?.fetched ? 'Re-fetch' : 'Fetch'}
            </button>
          </div>

          {/* Index step */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Step 2: Build Vector Index</div>
              <StatusBadge status={indexStatus} label="index" />
            </div>
            <button
              onClick={handleIndex}
              disabled={!yearStatus?.fetched || indexStatus?.status === 'running' || polling}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {indexStatus?.status === 'running'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : yearStatus?.indexed
                  ? <RefreshCw className="w-4 h-4" />
                  : <Database className="w-4 h-4" />
              }
              {yearStatus?.indexed ? 'Rebuild' : 'Build Index'}
            </button>
          </div>
        </div>
      )}

      {/* Overview table */}
      {venues.length > 0 && (
        <div className="mt-6">
          <div className="text-sm font-medium text-gray-700 mb-2">All Conferences Status</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="pb-2 pr-4">Conference</th>
                  <th className="pb-2 pr-4">Year</th>
                  <th className="pb-2 pr-4">Fetched</th>
                  <th className="pb-2">Indexed</th>
                </tr>
              </thead>
              <tbody>
                {venues.flatMap(v =>
                  v.available_years.map(y => (
                    <tr key={`${v.name}-${y}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 pr-4 font-medium">{v.display_name}</td>
                      <td className="py-1.5 pr-4">{y}</td>
                      <td className="py-1.5 pr-4">
                        {v.status?.[String(y)]?.fetched
                          ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-1.5">
                        {v.status?.[String(y)]?.indexed
                          ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
