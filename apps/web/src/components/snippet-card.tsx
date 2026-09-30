import type { SnippetDto } from '@snippets/shared';
import { Link } from 'react-router';
import { CodePreview } from '@/components/code-preview';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SnippetCardProps {
  snippet: SnippetDto;
}

/**
 * Kartu snippet untuk grid di homepage.
 * Seluruh kartu adalah link ke halaman detail (keputusan: detail berupa route
 * `/snippet/:id`, bukan modal, supaya bisa dibagikan).
 */
export function SnippetCard({ snippet }: SnippetCardProps) {
  return (
    <Link to={`/snippet/${snippet.id}`} className="block h-full">
      <Card className="h-full gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg">
        <CardHeader>
          <CardTitle className="line-clamp-1 text-base font-semibold">{snippet.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono text-[11px]">
              {snippet.language}
            </Badge>
            {snippet.rank !== null ? (
              <Badge variant="outline" className="text-[11px] font-normal">
                rank {snippet.rank.toFixed(3)}
              </Badge>
            ) : null}
            {snippet.embeddingStatus === 'ready' ? (
              <Badge variant="outline" className="text-[11px] font-normal">
                embedding
              </Badge>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {snippet.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{snippet.description}</p>
          ) : null}

          <CodePreview snippet={snippet} />

          {snippet.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {snippet.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[11px] font-normal">
                  #{tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}
