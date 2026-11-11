import type { Metadata, Viewport } from 'next';
import './globals.css';

const title = 'PlanProof — AI proposes. PostgreSQL proves.';
const description =
  'Paste the index or query rewrite your AI assistant suggested. PlanProof runs it in a real PostgreSQL in your browser, measures it, and checks the results are identical.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: 'website' },
  twitter: { card: 'summary', title, description },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#121315' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
