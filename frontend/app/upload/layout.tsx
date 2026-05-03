import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Upload Document — DocTranslate',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
