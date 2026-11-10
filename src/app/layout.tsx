import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlanProof — did your AI’s SQL suggestion actually help?',
  description:
    'Paste the index or rewrite your AI suggested. PlanProof runs it in a real Postgres in your browser, measures it, and checks the results are identical.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
