import type {
  ApiErrorCode,
  ApiErrorDetail,
  CreateSnippetInput,
  ListSnippetsQuery,
  PaginationMetaDto,
  RegexTestResultDto,
  SnippetDto,
  TagDto,
  TestRegexInput,
  UpdateSnippetInput,
} from '@snippets/shared';
import {
  apiErrorSchema,
  deletedResponseSchema,
  regexTestResponseSchema,
  snippetListResponseSchema,
  snippetResponseSchema,
  tagListResponseSchema,
} from '@snippets/shared/validators';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Error API yang sudah dinormalisasi.
 * `code` untuk branching, `details` untuk menandai field form yang bermasalah.
 */
export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: ApiErrorDetail[];

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Bentuk minimal `safeParse` milik zod. Didefinisikan struktural supaya
 * apps/web tidak perlu menambahkan zod sebagai dependency langsung.
 */
type SafeParser<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      // content-type HANYA dikirim bila request punya body.
      // Fastify menolak body kosong yang mengaku application/json dengan
      // "Body cannot be empty when content-type is set to 'application/json'"
      // -- itu yang membuat tombol Hapus (DELETE tanpa body) selalu gagal 400.
      // GET lolos dari masalah ini karena Fastify tidak mem-parse body GET.
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const payload: unknown = response.status === 204 ? null : await response.json();

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);

    if (parsed.success) {
      throw new ApiClientError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details ?? [],
      );
    }

    throw new ApiClientError(
      response.status,
      'INTERNAL_ERROR',
      response.statusText || 'Request gagal tanpa body error yang dikenal',
    );
  }

  return payload as T;
}

function parseOrThrow<T>(payload: unknown, schema: SafeParser<T>, context: string): T {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiClientError(
      502,
      'INTERNAL_ERROR',
      `Respons API tidak sesuai kontrak untuk ${context}`,
    );
  }

  return parsed.data;
}

type QueryValue = string | number | boolean | undefined;

function toQueryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }

    search.set(key, String(value));
  }

  const query = search.toString();

  return query.length > 0 ? `?${query}` : '';
}

export interface SnippetPage {
  items: SnippetDto[];
  meta: PaginationMetaDto;
}

/** Mengambil daftar snippet; envelope dibuka dan respons divalidasi skema shared. */
export async function listSnippets(params: Partial<ListSnippetsQuery> = {}): Promise<SnippetPage> {
  const payload = await request<unknown>(`/snippets${toQueryString(params)}`);
  const parsed = parseOrThrow(payload, snippetListResponseSchema, 'daftar snippet');

  return { items: parsed.data, meta: parsed.meta };
}

export async function getSnippet(id: string): Promise<SnippetDto> {
  const payload = await request<unknown>(`/snippets/${id}`);

  return parseOrThrow(payload, snippetResponseSchema, 'satu snippet').data;
}

/** Daftar tag + jumlah pemakaiannya, untuk chips filter dan autocomplete. */
export async function listTags(): Promise<TagDto[]> {
  const payload = await request<unknown>('/tags');

  return parseOrThrow(payload, tagListResponseSchema, 'daftar tag').data;
}

export async function createSnippet(input: CreateSnippetInput): Promise<SnippetDto> {
  const payload = await request<unknown>('/snippets', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return parseOrThrow(payload, snippetResponseSchema, 'snippet baru').data;
}

export async function updateSnippet(id: string, patch: UpdateSnippetInput): Promise<SnippetDto> {
  const payload = await request<unknown>(`/snippets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

  return parseOrThrow(payload, snippetResponseSchema, 'perbaruan snippet').data;
}

export async function deleteSnippet(id: string): Promise<string> {
  const payload = await request<unknown>(`/snippets/${id}`, { method: 'DELETE' });

  return parseOrThrow(payload, deletedResponseSchema, 'penghapusan snippet').data.id;
}

export async function testRegex(input: TestRegexInput): Promise<RegexTestResultDto> {
  const payload = await request<unknown>('/regex/test', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return parseOrThrow(payload, regexTestResponseSchema, 'hasil uji regex').data;
}

export function describeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.details.length > 0) {
      const fields = error.details.map((item) => `${item.field}: ${item.message}`).join(', ');

      return `${error.message} (${fields})`;
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Terjadi kesalahan yang tidak diketahui';
}
