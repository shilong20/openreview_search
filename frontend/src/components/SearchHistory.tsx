import { Clock3, Trash2, RotateCcw, History } from 'lucide-react'
import type { SearchHistoryItem } from '../types'

interface Props {
  items: SearchHistoryItem[]
  onLoad: (item: SearchHistoryItem) => void
  onDelete: (id: string) => void
  onClear: () => void
}

function formatTime(iso: string) {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return iso
  return t.toLocaleString()
}

export function SearchHistory({ items, onLoad, onDelete, onClear }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <History className="w-4 h-4 text-indigo-500" />
          Search History
        </h3>
        {items.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Clear all search history?')) onClear()
            }}
            className="text-xs text-gray-500 hover:text-red-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-gray-400 py-3">
          No history yet.
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {items.map(item => (
            <div
              key={item.id}
              className="border border-gray-200 rounded-lg p-2.5 hover:border-indigo-300 transition-colors"
            >
              <button
                onClick={() => onLoad(item)}
                className="w-full text-left"
              >
                <div className="text-xs text-gray-900 line-clamp-2">
                  {item.description}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {item.venue} {item.year} · {item.result.papers.length} results
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                  <Clock3 className="w-3 h-3" />
                  {formatTime(item.created_at)}
                </div>
              </button>

              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  onClick={() => onLoad(item)}
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800"
                >
                  <RotateCcw className="w-3 h-3" />
                  Open
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
