import { Code2 } from 'lucide-react';
import { Link, Route, Routes, useNavigate } from 'react-router';
import { EmptyState } from '@/components/feedback';
import { Footer } from '@/components/footer';
import { HomePage } from '@/routes/home-page';
import { SnippetDetailPage } from '@/routes/snippet-detail-page';

function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <EmptyState
      title="Halaman tidak ditemukan"
      description="Rute yang Anda tuju tidak ada di aplikasi ini."
      actionLabel="Ke beranda"
      onAction={() => navigate('/')}
    />
  );
}

function ShortcutHint() {
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">/</kbd>
      cari
      <span className="opacity-40">·</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
      buat
    </span>
  );
}

/** Kerangka aplikasi: header + router outlet + footer. */
export function App() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Code2 className="size-5 text-primary" />
            DevFlow
          </Link>
          <div className="ml-auto">
            <ShortcutHint />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/snippet/:id" element={<SnippetDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}
