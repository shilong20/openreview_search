import { useState, useEffect, useCallback, useRef } from 'react'
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
  const [customYear, setCustomYear] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<JobStatus | null>(null)
  const [indexStatus, setIndexStatus] = useState<JobStatus | null>(null)
  const [polling, setPolling] = useState(false)
  const customInputRef = useRef<HTMLInputElement>(null)

  const currentVenue = venues.find(v => v.name === selectedVenue)
  const yearStatus = selectedVenue && selectedYear
    ? currentVenue?.status?.[String(selectedYear)]
    : null

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
  const yearSelectValue = selectedYear || selectableYears[0] || ''

  useEffect(() => {
    if (!selectedVenue && venues.length > 0) {
      setSelectedVenue(venues[0].name)
    }
  }, [selectedVenue, venues])

  useEffect(() => {
    if (!selectedVenue || selectedYear > 0 || showCustomInput || selectableYears.length === 0) {
      return
    }
    setSelectedYear(selectableYears[0])
  }, [selectedVenue, selectedYear, showCustomInput, selectableYears])

  const handleYearSelect = (val: string) => {
    if (val === '__custom__') {
      setShowCustomInput(true)
      setSelectedYear(0)
      setTimeout(() => customInputRef.current?.focus(), 50)
    } else {
      setShowCustomInput(false)
      setCustomYear('')
      setSelectedYear(Number(val))
    }
  }

  const handleCustomYearConfirm = () => {
    const y = parseInt(customYear, 10)
    if (isNaN(y) || y < minYear || y > 2100) return
    setSelectedYear(y)
    setShowCustomInput(false)
  }

  const pollStatus = useCallback(async () => {
    if (!selectedVenue || !selectedYear) return
    const [fs, is] = await Promise.all([
      api.getFetchStatus(selectedVenue, selectedYear),
      api.getIndexStatus(selectedVenue, selectedYear),
    ])
    setFetchStatus(fs)
    setIndexStatus(is)

    const stillRunning = fs.status === 'running' || is.status === 'running'
    if (!stillRunning && polling) {
      setPolling(false)
      onVenuesChange()
    }
  }, [selectedVenue, selectedYear, polling, onVenuesChange])

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
    const force = !!yearStatus?.fetched
    await api.fetchPapers(selectedVenue, selectedYear, force)
    setPolling(true)
    pollStatus()
  }

  const handleIndex = async () => {
    if (!selectedVenue || !selectedYear) return
    const force = !!yearStatus?.indexed
    await api.buildIndex(selectedVenue, selectedYear, force)
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
            onChange={e => { setSelectedVenue(e.target.value); setSelectedYear(0); setShowCustomInput(false); setCustomYear('') }}
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
              disabled={!selectedVenue || selectableYears.length === 0}
            >
              {selectableYears.map((y: number) => (
                <option key={y} value={y}>{y}</option>
              ))}
              <option value="__custom__">＋ Add year ({minYear}+)…</option>
            </select>
          )}
          {selectedYear > 0 && !showCustomInput && (
            <p className="text-xs text-indigo-500 mt-1">{selectedYear} selected</p>
          )}
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
                  Object.keys(v.status).map((ys: string) => (
                    <tr key={`${v.name}-${ys}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 pr-4 font-medium">{v.display_name}</td>
                      <td className="py-1.5 pr-4">{ys}</td>
                      <td className="py-1.5 pr-4">
                        {v.status[ys]?.fetched
                          ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-1.5">
                        {v.status[ys]?.indexed
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
