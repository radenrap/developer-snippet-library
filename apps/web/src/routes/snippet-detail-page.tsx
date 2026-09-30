import type { RegexFlag } from '@snippets/shared';
import { REGEX_FLAGS } from '@snippets/shared';
import { ArrowLeft, Pencil, Play, Trash2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { DetailSkeleton, EmptyState } from '@/components/feedback';
import { SnippetFormDialog } from '@/components/snippet-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useDeleteSnippet, useSnippet, useTestRegex } from '@/hooks/use-snippets';

/**
 * CodeBlock di-lazy-load supaya shiki (core + grammar) tidak ikut ke bundle
 * halaman utama; chunk-nya baru diunduh saat halaman detail dibuka.
 */
const CodeBlock = lazy(() =>
  import('@/components/code-block').then((module) => ({ default: module.CodeBlock })),
);

function formatDate(value: string): string {
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Halaman detail snippet: kode ber-highlight, uji regex, dan metadata. */
export function SnippetDetailPage() {
  const params = useParams();
  const id = params.id ?? '';
  const navigate = useNavigate();
  const { data: snippet, isPending, isError } = useSnippet(id);
  const deleteMutation = useDeleteSnippet();
  const testMutation = useTestRegex();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<RegexFlag[]>(['g']);
  const [subject, setSubject] = useState('');

  if (isPending) {
    return <DetailSkeleton />;
  }

  if (isError || !snippet) {
    return (
      <EmptyState
        title="Snippet tidak ditemukan"
        description="Mungkin sudah dihapus, atau tautannya salah."
        actionLabel="Kembali ke daftar"
        onAction={() => navigate('/')}
      />
    );
  }

  function toggleFlag(flag: RegexFlag) {
    setFlags((current) =>
      current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag],
    );
  }

  function confirmDelete() {
    if (!snippet) {
      return;
    }

    deleteMutation.mutate(snippet.id, {
      onSuccess: () => navigate('/'),
    });
    setConfirmOpen(false);
  }

  const result = testMutation.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1 gap-1.5 text-muted-foreground"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="size-4" />
            Kembali
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{snippet.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono text-[11px]">
              {snippet.language}
            </Badge>
            {snippet.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[11px] font-normal">
                #{tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            Hapus
          </Button>
        </div>
      </div>

      {snippet.description ? (
        <p className="text-sm text-muted-foreground">{snippet.description}</p>
      ) : null}

      <Tabs defaultValue="code">
        <TabsList>
          <TabsTrigger value="code">Kode</TabsTrigger>
          <TabsTrigger value="regex">Uji regex</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="code" className="mt-4">
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
            <CodeBlock code={snippet.code} language={snippet.language} />
          </Suspense>
        </TabsContent>

        <TabsContent value="regex" className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Uji pattern terhadap teks lewat endpoint{' '}
            <code className="font-mono">/api/regex/test</code>. Tidak berhubungan dengan snippet ini
            kecuali Anda menyalin polanya.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pattern">Pattern</Label>
            <Input
              id="pattern"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="^[\w.+-]+@[\w-]+\.[\w.-]{2,}$"
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Flags</Label>
            <div className="flex flex-wrap gap-3">
              {REGEX_FLAGS.map((flag) => (
                <label key={flag} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={flags.includes(flag)}
                    onChange={() => toggleFlag(flag)}
                    className="size-4 accent-primary"
                  />
                  <span className="font-mono">{flag}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="subject">Teks uji</Label>
            <Textarea
              id="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              rows={5}
              placeholder="dev@example.com bukan-email"
              className="font-mono text-sm"
            />
          </div>

          <Button
            className="w-fit gap-1.5"
            disabled={pattern.length === 0 || testMutation.isPending}
            onClick={() => testMutation.mutate({ pattern, flags, subject })}
          >
            <Play className="size-4" />
            {testMutation.isPending ? 'Menguji…' : 'Jalankan'}
          </Button>

          {result ? (
            <div className="rounded-lg border p-4">
              {result.valid ? (
                <>
                  <p className="text-sm font-medium">
                    {result.matchCount} kecocokan
                    {result.matchCount === 100 ? ' (dibatasi 100)' : ''}
                  </p>
                  {result.matches.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {result.matches.map((match, index) => (
                        <li key={`${match.index}-${index}`} className="flex gap-3 text-sm">
                          <span className="w-16 shrink-0 text-muted-foreground">
                            @{match.index}
                          </span>
                          <code className="font-mono text-foreground">{match.value}</code>
                          {Object.keys(match.groups).length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {Object.entries(match.groups)
                                .map(([key, value]) => `${key}=${value}`)
                                .join(', ')}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Tidak ada yang cocok.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-destructive">Pattern tidak valid: {result.message}</p>
              )}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <div className="rounded-lg border p-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-[160px_1fr]">
              <dt className="text-muted-foreground">ID</dt>
              <dd className="font-mono break-all">{snippet.id}</dd>
              <dt className="text-muted-foreground">Author ID</dt>
              <dd className="font-mono break-all">{snippet.authorId}</dd>
              <dt className="text-muted-foreground">Bahasa</dt>
              <dd>{snippet.language}</dd>
              <dt className="text-muted-foreground">Dibuat</dt>
              <dd>{formatDate(snippet.createdAt)}</dd>
              <dt className="text-muted-foreground">Diubah</dt>
              <dd>{formatDate(snippet.updatedAt)}</dd>
              <dt className="text-muted-foreground">Status embedding</dt>
              <dd>
                <Badge variant="outline" className="text-[11px] font-normal">
                  {snippet.embeddingStatus}
                </Badge>
              </dd>
            </dl>
            <Separator className="my-4" />
            <p className="text-xs text-muted-foreground">
              Kolom embedding disiapkan untuk pencarian semantik (pgvector) dan masih kosong.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <SnippetFormDialog open={editOpen} onOpenChange={setEditOpen} snippet={snippet} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus snippet ini?</DialogTitle>
            <DialogDescription>
              &quot;{snippet.title}&quot; akan dihapus permanen beserta relasi tag-nya.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Menghapus…' : 'Ya, hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
