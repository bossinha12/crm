import { Company } from '../types';

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
  if (!company && !companyId) return false;
  if (company?.isStudioMode) return true;

  const checkStrings = [
    company?.id,
    company?.slug,
    company?.name,
    companyId
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
    if (!res.ok) return null;
    return await res.json();
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
  const res = await fetch('/api/studio/deliveries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao registrar prévia de estúdio no Turso');
  }

  return await res.json();
}

// Unlock download after payment (Atendente aciona no painel)
export async function unlockStudioDownload(deliveryId: string, unlockedBy: string): Promise<{ ok: boolean; downloadUnlocked: boolean }> {
  const res = await fetch(`/api/studio/deliveries/${deliveryId}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unlockedBy })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao liberar download no banco Turso');
  }

  return await res.json();
}

// Get single delivery status
export async function getStudioDelivery(deliveryId: string): Promise<StudioDeliveryRecord | null> {
  try {
    const res = await fetch(`/api/studio/deliveries/${deliveryId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Excluir entrega específica do banco Turso bossa
export async function deleteStudioDelivery(deliveryId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/studio/deliveries/${deliveryId}`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch (e) {
    console.error('Erro ao deletar projeto no Turso:', e);
    return false;
  }
}

// Limpeza em lote de projetos concluídos no banco Turso bossa
export async function cleanupStudioDeliveries(mode: 'completed' | 'all' = 'completed'): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/studio/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao executar limpeza no banco Turso');
  }

  return await res.json();
}

// Disparo de Download direto do arquivo de áudio ou vídeo no PC do cliente/produtor
export async function downloadMediaFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
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
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
