'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import DocumentCard, { Document } from '@/components/DocumentCard'
import { isAuthenticated } from '@/lib/auth'
import api from '@/lib/api'

interface QueueStats {
  waiting: number
  active: number
  avgProcessingMs: number | null
}

function QueueWidget() {
  const [stats, setStats] = useState<QueueStats | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data } = await api.get<QueueStats>('/queue/stats')
        setStats(data)
      } catch {
        // silently ignore — optional widget
      }
    }
    fetchStats()
    const id = setInterval(fetchStats, 10000)
    return () => clearInterval(id)
  }, [])

  if (!stats) return null

  const total = stats.waiting + stats.active
  const avgSec = stats.avgProcessingMs != null
    ? (stats.avgProcessingMs / 1000).toFixed(1)
    : null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300">
      <span className="relative flex h-2 w-2">
        {stats.active > 0 && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${stats.active > 0 ? 'bg-blue-500' : 'bg-blue-300 dark:bg-blue-700'}`} />
      </span>
      <span>
        <span className="font-semibold">{total}</span> in queue
        {avgSec && <span className="ml-1 text-blue-500 dark:text-blue-400">· avg {avgSec}s</span>}
      </span>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login')
      return
    }
    api
      .get<Document[]>('/documents')
      .then(({ data }) => setDocs(data))
      .catch(() => setError('Failed to load documents'))
      .finally(() => setLoading(false))
  }, [router])

  // Poll statuses for active documents every 5s
  useEffect(() => {
    if (docs.length === 0) return
    const TERMINAL = new Set(['uploaded', 'done', 'notarized'])
    const active = docs.filter((d) => !TERMINAL.has(d.status))
    if (active.length === 0) return

    const interval = setInterval(async () => {
      const updates = await Promise.allSettled(
        active.map((d) =>
          api
            .get<{ status: string }>(`/documents/${d._id}/status`)
            .then(({ data }) => ({ _id: d._id, status: data.status }))
        )
      )
      setDocs((prev) => {
        let changed = false
        const next = prev.map((d) => {
          const hit = updates.find(
            (u) => u.status === 'fulfilled' && u.value._id === d._id
          )
          if (hit && hit.status === 'fulfilled' && hit.value.status !== d.status) {
            changed = true
            return { ...d, status: hit.value.status as Document['status'] }
          }
          return d
        })
        return changed ? next : prev
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [docs])

  async function handlePay(docId: string) {
    setPayingId(docId)
    try {
      const { data } = await api.post<{ url: string }>('/payments/create-session', {
        documentId: docId,
        amount: 29.99,
      })
      window.location.href = data.url
    } catch {
      setError('Failed to start payment. Please try again.')
      setPayingId(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors">
      <Header />
      <main className="max-w-5xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Documents</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Track the status of your translation & notarization requests
            </p>
          </div>
          <div className="flex items-center gap-3">
            <QueueWidget />
            <Link
              href="/upload"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all"
            >
              + Upload Document
            </Link>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-20 text-gray-400 dark:text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              Loading…
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && docs.length === 0 && (
          <div data-testid="empty-state" className="text-center py-20">
            <p className="text-5xl mb-4">📄</p>
            <p className="text-gray-500 dark:text-gray-400 text-lg mb-6">No documents yet</p>
            <Link
              href="/upload"
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Upload your first document
            </Link>
          </div>
        )}

        {!loading && docs.length > 0 && (
          <div data-testid="document-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map((doc) => (
              <DocumentCard
                key={doc._id}
                doc={doc}
                onPay={() => handlePay(doc._id)}
                paying={payingId === doc._id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
