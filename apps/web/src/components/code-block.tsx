import { cn } from 'cn';
import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { highlightCode } from '@/lib/shiki';

interface CodeBlockProps {
  code: string;
  language: string;
  className?: string;
}

/**
 * Kode dengan syntax highlighting.
 *
 * Shiki dimuat malas (grammar per bahasa jadi chunk terpisah) dan highlighter-nya
 * singleton, jadi biaya hanya dibayar sekali per sesi. Selama menunggu, ditampilkan
 * kode polos agar tidak ada layar kosong.
 */
export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    highlightCode(code, language)
      .then((result) => {
        if (active) {
          setHtml(result);
        }
      })
      .catch(() => {
        if (active) {
          setHtml(null);
        }
      });

    return () => {
      active = false;
    };
  }, [code, language]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = setTimeout(() => setCopied(false), 1600);

    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard butuh secure context; kegagalan di sini tidak kritikal.
      setCopied(false);
    }
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-muted/30', className)}>
      <div className="flex items-center justify-between border-b bg-background/60 px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{language}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => {
            void handleCopy();
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied!' : 'Salin'}
        </Button>
      </div>

      {html ? (
        <div
          className="overflow-x-auto text-sm [&_code]:font-mono [&_pre]:p-4"
          // HTML dihasilkan Shiki dari kode milik pengguna dan sudah di-escape olehnya.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-4 text-sm">
          <code className="font-mono">{code}</code>
        </pre>
      )}
    </div>
  );
}
