'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import StatusBadge, { DocumentStatus } from '@/components/StatusBadge'
import { isAuthenticated, getToken } from '@/lib/auth'
import api from '@/lib/api'

interface DocDetail {
  _id: string
  originalFile: string
  originalFileName: string | null
  translatedFile: string | null
  fromLang: string
  toLang: string
  status: DocumentStatus
  createdAt: string
}

interface DocContent {
  original: string | null
  translated: string | null
}

async function downloadWithAuth(url: string, filename: string) {
  const token = getToken()
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objectUrl)
}

function DownloadButton({
  onClick,
  label,
  icon,
  disabled,
  loading,
}: {
  onClick?: () => void
  label: string
  icon: string
  disabled?: boolean
  loading?: boolean
}) {
  if (disabled) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
      >
        {icon} {label}
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60"
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
      ) : icon}
      {label}
    </button>
  )
}

function ContentPane({
  title,
  content,
  loading,
  placeholder,
}: {
  title: string
  content: string | null
  loading: boolean
  placeholder: string
}) {
  return (
    <div className="flex flex-col flex-1 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </h2>
      </div>
      <div className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 overflow-auto min-h-[280px] font-mono text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap transition-colors">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              Loading…
            </div>
          </div>
        ) : content ? (
          content
        ) : (
          <span className="text-gray-400 dark:text-gray-600 italic not-italic font-sans">{placeholder}</span>
        )}
      </div>
    </div>
  )
}

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [doc, setDoc] = useState<DocDetail | null>(null)
  const [content, setContent] = useState<DocContent>({ original: null, translated: null })
  const [docLoading, setDocLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    if (!isAuthenticated()) { router.push('/login'); return }

    api.get<DocDetail>(`/documents/${id}`)
      .then(({ data }) => {
        setDoc(data)
        if (data.originalFile || data.translatedFile) {
          setContentLoading(true)
          api.get<DocContent>(`/documents/${id}/content`)
            .then(({ data: c }) => setContent(c))
            .catch(() => {})
            .finally(() => setContentLoading(false))
        }
      })
      .catch(() => setError('Document not found.'))
      .finally(() => setDocLoading(false))
  }, [id, router])

  if (docLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <Header />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            Loading document…
          </div>
        </div>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-red-500">{error || 'Document not found.'}</p>
          <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  const hasTranslation = !!doc.translatedFile && ['translated', 'notarizing', 'notarized', 'done'].includes(doc.status)
  const hasCert = doc.status === 'notarized' || doc.status === 'done'

  async function handleDownload(key: string, url: string, filename: string) {
    setDownloading(key)
    setDownloadError('')
    try {
      await downloadWithAuth(url, filename)
    } catch (e) {
      setDownloadError(`Download failed: ${(e as Error).message}`)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors">
      <Header />
      <main className="max-w-6xl mx-auto w-full px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
          <Link href="/dashboard" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium truncate max-w-xs">
            {doc.originalFileName || doc.originalFile.split('/').pop()}
          </span>
        </div>

        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {doc.originalFileName || doc.originalFile.split('/').pop()}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {doc.fromLang} → {doc.toLang} ·{' '}
              {new Date(doc.createdAt).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            </p>
          </div>
          <StatusBadge status={doc.status} />
        </div>

        {/* Download buttons */}
        <div className="flex flex-wrap gap-3 mb-8 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <DownloadButton
            onClick={() => handleDownload('original', `/api/documents/${doc._id}/download?type=original`, doc.originalFileName || doc.originalFile.split('/').pop() || `original-${doc._id}`)}
            label="Download Original"
            icon="⬇"
            loading={downloading === 'original'}
          />
          <DownloadButton
            onClick={() => handleDownload('translation', `/api/documents/${doc._id}/download`, `translation-${doc._id}${doc.translatedFile ? '.' + doc.translatedFile.split('.').pop() : ''}`)}
            label="Download Translation"
            icon="📄"
            disabled={!hasTranslation}
            loading={downloading === 'translation'}
          />
          <DownloadButton
            onClick={() => handleDownload('certificate', `/api/documents/${doc._id}/certificate`, `certificate-${doc._id}.pdf`)}
            label="Download Certificate"
            icon="🏛"
            disabled={!hasCert}
            loading={downloading === 'certificate'}
          />
        </div>

        {downloadError && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 mb-4">
            {downloadError}
          </p>
        )}

        {/* Side-by-side content */}
        <div className="flex flex-col lg:flex-row gap-5">
          <ContentPane
            title={`Original · ${doc.fromLang}`}
            content={content.original}
            loading={contentLoading}
            placeholder="Original file content will appear here."
          />
          <div className="hidden lg:flex items-center">
            <div className="w-px h-full bg-gray-200 dark:bg-gray-700 mx-2" />
          </div>
          <ContentPane
            title={`Translation · ${doc.toLang}`}
            content={content.translated}
            loading={contentLoading}
            placeholder={
              hasTranslation
                ? 'Translation content will appear here.'
                : 'Translation is not ready yet. Check back after payment.'
            }
          />
        </div>
      </main>
    </div>
  )
}
