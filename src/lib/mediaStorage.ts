import { executeTursoBatch, executeTursoDirect, TursoStatement } from './tursoClient';

export const TURSO_MEDIA_PREFIX = 'turso://';

// 400.000 chars base64 = ~300 KB binário por chunk (divisível por 4 para concatenação direta)
const MEDIA_CHUNK_SIZE = 400_000;
const UPLOAD_STATEMENTS_PER_BATCH = 2;
const FETCH_CHUNKS_PER_PAGE = 15;

let ensureMediaTablePromise: Promise<void> | null = null;

// Cache em memória de URLs blob: já montadas para playback instantâneo sem refazer downloads
const resolvedMediaCache = new Map<string, Promise<string>>();
const createdBlobUrls = new Map<string, string>();

export function isTursoMediaUrl(url?: string | null): boolean {
  return typeof url === 'string' && url.startsWith(TURSO_MEDIA_PREFIX);
}

export function extractTursoMediaId(url?: string | null): string | null {
  if (!isTursoMediaUrl(url)) return null;
  const mediaId = String(url).slice(TURSO_MEDIA_PREFIX.length).trim();
  return mediaId || null;
}

export async function ensureMediaTable(): Promise<void> {
  if (!ensureMediaTablePromise) {
    ensureMediaTablePromise = executeTursoDirect(`
      CREATE TABLE IF NOT EXISTS studio_media_chunks (
        media_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        file_name TEXT,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (media_id, chunk_index)
      )
    `)
      .then(() => undefined)
      .catch((err) => {
        ensureMediaTablePromise = null;
        throw err;
      });
  }
  return ensureMediaTablePromise;
}

function blobToDataParts(blob: Blob): Promise<{ mimeType: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Falha ao ler arquivo de mídia'));
        return;
      }
      const commaIndex = reader.result.indexOf(',');
      if (commaIndex === -1) {
        reject(new Error('Formato de arquivo inválido'));
        return;
      }
      const header = reader.result.slice(0, commaIndex);
      const base64 = reader.result.slice(commaIndex + 1);
      const mimeMatch = header.match(/^data:([^;]+);base64$/i);
      const mimeType = (mimeMatch?.[1] || blob.type || 'audio/mpeg').trim();
      resolve({ mimeType, base64 });
    };
    reader.onerror = () => reject(new Error('Erro ao processar arquivo selecionado'));
    reader.readAsDataURL(blob);
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Faz upload de áudio/vídeo em chunks diretamente para a tabela `studio_media_chunks` do Turso (bossa)
 * Retorna uma referência curta `turso://med_...` (< 35 bytes) para salvar no Firestore sem estourar o limite de 1 MB.
 */
export async function uploadMediaToTurso(fileOrBlob: Blob | File, customName?: string): Promise<string> {
  await ensureMediaTable();

  const { mimeType, base64 } = await blobToDataParts(fileOrBlob);
  if (!base64) {
    throw new Error('O arquivo selecionado está vazio.');
  }

  const fileName = customName || (fileOrBlob instanceof File ? fileOrBlob.name : 'audio.webm');
  const mediaId = `med_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const createdAt = new Date().toISOString();

  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += MEDIA_CHUNK_SIZE) {
    chunks.push(base64.slice(i, i + MEDIA_CHUNK_SIZE));
  }
  const totalChunks = chunks.length;

  try {
    for (let i = 0; i < chunks.length; i += UPLOAD_STATEMENTS_PER_BATCH) {
      const batchSlice = chunks.slice(i, i + UPLOAD_STATEMENTS_PER_BATCH);
      const statements: TursoStatement[] = batchSlice.map((chunkData, offset) => ({
        sql: `
          INSERT INTO studio_media_chunks (
            media_id, chunk_index, total_chunks, mime_type, file_name, data, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          mediaId,
          i + offset,
          totalChunks,
          mimeType,
          fileName,
          chunkData,
          createdAt,
        ],
      }));
      await executeTursoBatch(statements);
    }
  } catch (err) {
    // Limpa chunks parciais em caso de falha durante o envio
    executeTursoDirect('DELETE FROM studio_media_chunks WHERE media_id = ?', [mediaId]).catch(() => {});
    throw err;
  }

  const tursoUrl = `${TURSO_MEDIA_PREFIX}${mediaId}`;

  // Pré-aquece cache local do navegador para reprodução imediata após o envio
  try {
    const localBlobUrl = URL.createObjectURL(fileOrBlob);
    createdBlobUrls.set(mediaId, localBlobUrl);
    resolvedMediaCache.set(tursoUrl, Promise.resolve(localBlobUrl));
  } catch (e) {}

  return tursoUrl;
}

/**
 * Converte uma URL `turso://med_...` em uma URL `blob:` pronta para `<audio>`, `<video>` ou download.
 * Mantém cache em memória e pagina leituras para suportar áudios e vídeos maiores sem estourar limites HTTP.
 */
export async function resolveMediaUrl(url: string): Promise<string> {
  if (!url) return url;
  if (!isTursoMediaUrl(url)) return url;

  const existing = resolvedMediaCache.get(url);
  if (existing) return existing;

  const mediaId = extractTursoMediaId(url);
  if (!mediaId) return url;

  const loadPromise = (async () => {
    const firstResult = await executeTursoDirect(
      `
        SELECT chunk_index, total_chunks, mime_type, data
        FROM studio_media_chunks
        WHERE media_id = ? AND chunk_index >= 0 AND chunk_index < ?
        ORDER BY chunk_index ASC
      `,
      [mediaId, FETCH_CHUNKS_PER_PAGE]
    );

    const firstRows = firstResult?.rows || [];
    if (firstRows.length === 0) {
      throw new Error('Arquivo de mídia não encontrado ou já removido do banco Turso.');
    }

    const totalChunks = Number(firstRows[0]?.[1]?.value || firstRows.length);
    const mimeType = String(firstRows[0]?.[2]?.value || 'audio/mpeg');
    const chunkParts: string[] = firstRows.map((row: any) => String(row?.[3]?.value || ''));

    for (let offset = FETCH_CHUNKS_PER_PAGE; offset < totalChunks; offset += FETCH_CHUNKS_PER_PAGE) {
      const nextResult = await executeTursoDirect(
        `
          SELECT chunk_index, total_chunks, mime_type, data
          FROM studio_media_chunks
          WHERE media_id = ? AND chunk_index >= ? AND chunk_index < ?
          ORDER BY chunk_index ASC
        `,
        [mediaId, offset, offset + FETCH_CHUNKS_PER_PAGE]
      );
      const nextRows = nextResult?.rows || [];
      for (const row of nextRows) {
        chunkParts.push(String(row?.[3]?.value || ''));
      }
    }

    const fullBase64 = chunkParts.join('');
    if (!fullBase64) {
      throw new Error('Conteúdo de mídia vazio no banco Turso.');
    }

    const bytes = base64ToUint8Array(fullBase64);
    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    createdBlobUrls.set(mediaId, blobUrl);
    return blobUrl;
  })().catch((err) => {
    resolvedMediaCache.delete(url);
    throw err;
  });

  resolvedMediaCache.set(url, loadPromise);
  return loadPromise;
}

export async function deleteTursoMediaByUrls(urls: Array<string | null | undefined>): Promise<void> {
  const uniqueIds = Array.from(
    new Set(urls.map((u) => extractTursoMediaId(u)).filter((id): id is string => Boolean(id)))
  );
  if (uniqueIds.length === 0) return;

  for (const mediaId of uniqueIds) {
    resolvedMediaCache.delete(`${TURSO_MEDIA_PREFIX}${mediaId}`);
    const cachedBlobUrl = createdBlobUrls.get(mediaId);
    if (cachedBlobUrl) {
      try {
        URL.revokeObjectURL(cachedBlobUrl);
      } catch (e) {}
      createdBlobUrls.delete(mediaId);
    }
  }

  try {
    const statements: TursoStatement[] = uniqueIds.map((mediaId) => ({
      sql: 'DELETE FROM studio_media_chunks WHERE media_id = ?',
      args: [mediaId],
    }));
    await executeTursoBatch(statements);
  } catch (err) {
    console.warn('Aviso ao limpar chunks de mídia no Turso:', err);
  }
}

export async function deleteTursoMediaByUrl(url?: string | null): Promise<void> {
  if (!url) return;
  await deleteTursoMediaByUrls([url]);
}
