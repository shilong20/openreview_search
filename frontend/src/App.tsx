import { useState, useEffect } from 'react'
import { BookOpen } from 'lucide-react'
import { DataManager } from './components/DataManager'
import { SearchPanel } from './components/SearchPanel'
import { ResultsList } from './components/ResultsList'
import { api } from './api'
import type { Venue, SearchResult } from './types'

type Tab = 'search' | 'data'

export default function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [venues, setVenues] = useState<Venue[]>([])
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [searchMeta, setSearchMeta] = useState<{ venue: string; year: number; description: string } | null>(null)

  const loadVenues = async () => {
    try {
      const data = await api.getVenues()
      setVenues(data)
    } catch (e) {
      console.error('Failed to load venues', e)
    }
  }

  useEffect(() => {
    loadVenues()
  }, [])

  const handleResults = (result: SearchResult, venue: string, year: number, description: string) => {
    setSearchResult(result)
    setSearchMeta({ venue, year, description })
    // Switch to results view if on data tab
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-indigo-600" />
              <span className="font-bold text-gray-900 text-lg">AI Paper Search</span>
              <span className="text-xs text-gray-400 ml-1">ICLR · NeurIPS · ICML · CVPR · ACL</span>
            </div>
            <nav className="flex gap-1">
              <button
                onClick={() => setTab('search')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === 'search'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Search
              </button>
              <button
                onClick={() => setTab('data')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === 'data'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Data Manager
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'data' ? (
          <div className="max-w-2xl mx-auto">
            <DataManager venues={venues} onVenuesChange={loadVenues} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: search panel */}
            <div className="lg:col-span-1">
              <SearchPanel venues={venues} onResults={handleResults} />
            </div>

            {/* Right: results */}
            <div className="lg:col-span-2">
              {searchResult && searchMeta ? (
                <ResultsList
                  result={searchResult}
                  venue={searchMeta.venue}
                  year={searchMeta.year}
                  description={searchMeta.description}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-96 text-gray-300">
                  <BookOpen className="w-16 h-16 mb-4" />
                  <p className="text-sm">Enter your research interests and search</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
