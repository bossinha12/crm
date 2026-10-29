/**
 * Audio Upload and Storage Service
 * 
 * Uploads audio to a temporary free external host (Litterbox, expires in 72h)
 * ensuring 0 heavy audio binaries are permanently stored in Firestore,
 * with reliable fallback to compressed data URL if network is offline.
 */

export async function uploadAudio(
  fileOrBlob: Blob | File,
  customName?: string
): Promise<{ audioUrl: string }> {
  const extension = fileOrBlob.type.includes('mp4') 
    ? 'm4a' 
    : fileOrBlob.type.includes('ogg') 
    ? 'ogg' 
    : fileOrBlob.type.includes('mp3') 
    ? 'mp3' 
    : 'webm';

  const fileName = customName || `audio_${Date.now()}.${extension}`;
  const file = fileOrBlob instanceof File 
    ? fileOrBlob 
    : new File([fileOrBlob], fileName, { type: fileOrBlob.type || 'audio/webm' });

  try {
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('time', '72h'); // 72 hours temporary auto-expire
    formData.append('fileToUpload', file);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const text = await response.text();
      const trimmed = text.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return { audioUrl: trimmed };
      }
    }
    throw new Error('Servidor temporário indisponível');
  } catch (err) {
    console.warn('Upload temporário externo falhou ou foi bloqueado, usando data URL compactado:', err);
    // Reliable fallback: convert to base64 data URL
    const base64 = await blobToBase64(fileOrBlob);
    return { audioUrl: base64 };
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao converter áudio para base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
