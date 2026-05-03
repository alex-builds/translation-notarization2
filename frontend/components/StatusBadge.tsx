'use client'

export type DocumentStatus =
  | 'uploaded'
  | 'paid'
  | 'translating'
  | 'translated'
  | 'notarizing'
  | 'notarized'
  | 'done'

const statusConfig: Record<DocumentStatus, { label: string; className: string }> = {
  uploaded:   { label: 'Uploaded',    className: 'bg-gray-100 text-gray-700' },
  paid:       { label: 'Paid',        className: 'bg-blue-100 text-blue-700' },
  translating:{ label: 'Translating', className: 'bg-yellow-100 text-yellow-700' },
  translated: { label: 'Translated',  className: 'bg-orange-100 text-orange-700' },
  notarizing: { label: 'Notarizing',  className: 'bg-purple-100 text-purple-700' },
  notarized:  { label: 'Notarized',   className: 'bg-cyan-100 text-cyan-700' },
  done:       { label: 'Done',        className: 'bg-green-100 text-green-700' },
}

export default function StatusBadge({ status }: { status: DocumentStatus }) {
  const config = statusConfig[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' }
  return (
    <span data-testid="status-badge" className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
