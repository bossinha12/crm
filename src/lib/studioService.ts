import { Company } from '../types';
import { executeTursoDirect } from './tursoClient';
import { deleteTursoMediaByUrls, resolveMediaUrl } from './mediaStorage';

export { executeTursoDirect };

export interface StudioDeliveryRecord {
  id: string;
  orderId?: string;
  chatId?: string;
  clientName?: string;
  clientPhone?: string;
  title: string;
  mediaType: 'audio' | 'video' | 'flyer' | 'other';
  previewUrl: string;
  previewName?: string;
  finalDownloadUrl?: string | null;
  finalDownloadName?: string;
  audioDuration?: number;
  price?: number;
  paid?: boolean;
  downloadUnlocked: boolean;
  unlockedAt?: string;
  unlockedBy?: string;
  notes?: string;
  createdAt?: string;
}

// Checks if a company is the Bossa Studio (or has isStudioMode enabled)
export function isBossaStudioCompany(company?: Company | null, companyId?: string): boolean {
  if (company?.isStudioMode) return true;

  const urlText = typeof window !== 'undefined' ? window.location.href.toLowerCase() : '';

  const checkStrings = [
    company?.id,
    company?.slug,
    company?.name,
    companyId,
    urlText
  ].filter(Boolean).map(s => String(s).toLowerCase().trim());

  return checkStrings.some(s => 
    s.includes('bossa') || 
    s.includes('estudio') || 
    s.includes('produtora') || 
    s === 'bossa'
  );
}

// Check Turso backend health status
export async function checkTursoStatus(): Promise<{ ok: boolean; database: string; totalDeliveries: number } | null> {
  try {
    const res = await fetch('/api/studio/status');
    if (res.ok) {
      const data = await res.json();
      if (data && data.ok) return data;
    }
  } catch (e) {}

  // Fallback direto ao Turso
  try {
    const res = await executeTursoDirect('SELECT count(*) as total FROM studio_deliveries');
    const total = Number(res?.rows?.[0]?.[0]?.value || 0);
    return { ok: true, database: 'bossa', totalDeliveries: total };
  } catch (e) {
    return null;
  }
}

// Save delivery/preview in Turso
export async function saveStudioDelivery(payload: {
  chatId: string;
  clientName?: string;
  clientPhone?: string;
  title: string;
  mediaType: 'audio' | 'video' | 'flyer';
  previewUrl: string;
  previewName?: string;
  finalDownloadUrl?: string;
  finalDownloadName?: string;
  audioDuration?: number;
  price?: number;
  notes?: string;
}): Promise<{ ok: boolean; deliveryId: string }> {
  const deliveryId = `del_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // 1. Tenta endpoint Express se disponível
  try {
    const res = await fetch('/api/studio/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.deliveryId) return data;
    }
  } catch (e) {}

  // 2. Fallback direto ao Turso HTTP (Garante funcionamento no Vercel!)
  await executeTursoDirect(`
    INSERT INTO studio_deliveries (
      id, order_id, chat_id, client_name, client_phone, title, media_type,
      preview_url, preview_name, final_download_url, final_download_name,
      audio_duration, price, paid, download_unlocked, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
  `, [
    deliveryId,
    deliveryId,
    payload.chatId,
    payload.clientName || 'Cliente',
    payload.clientPhone || null,
    payload.title,
    payload.mediaType,
    payload.previewUrl,
    payload.previewName || null,
    payload.finalDownloadUrl || payload.previewUrl,
    payload.finalDownloadName || payload.previewName || null,
    payload.audioDuration || 0,
    payload.price || 0,
    payload.notes || null,
    now,
    now
  ]);

  return { ok: true, deliveryId };
}

// Unlock download after payment (Atendente aciona no painel)
export async function unlockStudioDownload(deliveryId: string, unlockedBy: string): Promise<{ ok: boolean; downloadUnlocked: boolean }> {
  const now = new Date().toISOString();

  // 1. Tenta endpoint Express se disponível
  try {
    const res = await fetch(`/api/studio/deliveries/${deliveryId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unlockedBy })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}

  // 2. Fallback direto ao Turso HTTP (Garante funcionamento no Vercel!)
  await executeTursoDirect(`
    UPDATE studio_deliveries 
    SET download_unlocked = 1, paid = 1, unlocked_at = ?, unlocked_by = ?, updated_at = ?
    WHERE id = ? OR order_id = ?
  `, [now, unlockedBy, now, deliveryId, deliveryId]);

  return { ok: true, downloadUnlocked: true };
}

// Get single delivery status
export async function getStudioDelivery(deliveryId: string): Promise<StudioDeliveryRecord | null> {
  try {
    const res = await fetch(`/api/studio/deliveries/${deliveryId}`);
    if (res.ok) return await res.json();
  } catch (e) {}

  try {
    const res = await executeTursoDirect('SELECT * FROM studio_deliveries WHERE id = ? OR order_id = ? LIMIT 1', [deliveryId, deliveryId]);
    if (!res?.rows || res.rows.length === 0) return null;
    const row = res.rows[0];
    const isUnlocked = Boolean(Number(row[14]?.value || 0));
    return {
      id: String(row[0]?.value),
      orderId: String(row[1]?.value),
      chatId: String(row[2]?.value),
      clientName: String(row[3]?.value),
      title: String(row[5]?.value),
      mediaType: row[6]?.value as any,
      previewUrl: String(row[7]?.value),
      previewName: String(row[8]?.value),
      downloadUnlocked: isUnlocked,
      finalDownloadUrl: isUnlocked ? String(row[9]?.value || row[7]?.value) : null,
      audioDuration: Number(row[11]?.value || 0),
      unlockedAt: String(row[15]?.value || ''),
      unlockedBy: String(row[16]?.value || '')
    };
  } catch (e) {
    return null;
  }
}

// Excluir entrega específica do banco Turso bossa (inclui limpeza de chunks de mídia)
export async function deleteStudioDelivery(
  deliveryId?: string | null,
  extraMediaUrls: Array<string | null | undefined> = []
): Promise<boolean> {
  if (deliveryId) {
    try {
      const res = await fetch(`/api/studio/deliveries/${deliveryId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        if (extraMediaUrls.length > 0) {
          await deleteTursoMediaByUrls(extraMediaUrls);
        }
        return true;
      }
    } catch (e) {}
  }

  try {
    const urlsToClean: Array<string | null | undefined> = [...extraMediaUrls];
    if (deliveryId) {
      try {
        const lookup = await executeTursoDirect(
          'SELECT preview_url, final_download_url FROM studio_deliveries WHERE id = ? OR order_id = ?',
          [deliveryId, deliveryId]
        );
        for (const row of lookup?.rows || []) {
          urlsToClean.push(row?.[0]?.value, row?.[1]?.value);
        }
      } catch (e) {}

      await executeTursoDirect('DELETE FROM studio_deliveries WHERE id = ? OR order_id = ?', [
        deliveryId,
        deliveryId
      ]);
    }

    await deleteTursoMediaByUrls(urlsToClean);
    return true;
  } catch (e) {
    console.error('Erro ao deletar projeto diretamente no Turso:', e);
    return false;
  }
}

// Limpeza em lote de projetos concluídos no banco Turso bossa
export async function cleanupStudioDeliveries(mode: 'completed' | 'all' = 'completed'): Promise<{ ok: boolean; message: string }> {
  // 1. Tenta endpoint Express se disponível
  try {
    const res = await fetch('/api/studio/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok) return data;
    }
  } catch (e) {}

  // 2. Fallback direto ao Turso HTTP (Garante funcionamento 100% no Vercel!)
  const urlsToClean: Array<string | null | undefined> = [];
  if (mode !== 'all') {
    try {
      const lookup = await executeTursoDirect(
        'SELECT preview_url, final_download_url FROM studio_deliveries WHERE download_unlocked = 1'
      );
      for (const row of lookup?.rows || []) {
        urlsToClean.push(row?.[0]?.value, row?.[1]?.value);
      }
    } catch (e) {}
  }

  const sql = mode === 'all'
    ? 'DELETE FROM studio_deliveries'
    : 'DELETE FROM studio_deliveries WHERE download_unlocked = 1';

  const result = await executeTursoDirect(sql);
  const rowsAffected = Number(result?.affected_row_count || 0);

  if (mode === 'all') {
    executeTursoDirect('DELETE FROM studio_media_chunks').catch(() => {});
  } else if (urlsToClean.length > 0) {
    await deleteTursoMediaByUrls(urlsToClean);
  }

  return {
    ok: true,
    message: mode === 'all'
      ? 'Todos os projetos foram removidos do banco Turso da Produtora com sucesso!'
      : `Todos os projetos já entregues e pagos foram removidos do banco Turso com sucesso! (${rowsAffected} removidos)`
  };
}

// Disparo de Download direto do arquivo de áudio ou vídeo no PC do cliente/produtor
export async function downloadMediaFile(url: string, filename: string): Promise<void> {
  try {
    const resolvedUrl = await resolveMediaUrl(url);
    if (resolvedUrl.startsWith('blob:') || resolvedUrl.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = resolvedUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const res = await fetch(resolvedUrl);
    if (!res.ok) throw new Error('Falha ao obter arquivo');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err) {
    // Fallback padrão se CORS bloquear fetch
    const fallbackUrl = await resolveMediaUrl(url).catch(() => url);
    const link = document.createElement('a');
    link.href = fallbackUrl;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
