import { uploadMediaToTurso } from './mediaStorage';

/**
 * Audio & Video Upload Service
 *
 * Salva mídias diretamente no banco Turso (`bossa` -> `studio_media_chunks`) em chunks
 * e retorna uma referência curta `turso://med_...` garantindo que nenhum documento do Firestore
 * ultrapasse o limite de 1 MB (1.048.576 bytes).
 */
export async function uploadAudio(
  fileOrBlob: Blob | File,
  customName?: string
): Promise<{ audioUrl: string }> {
  const extension = fileOrBlob.type.includes('mp4')
    ? 'm4a'
    : fileOrBlob.type.includes('ogg')
    ? 'ogg'
    : fileOrBlob.type.includes('mp3') || fileOrBlob.type.includes('mpeg')
    ? 'mp3'
    : fileOrBlob.type.includes('wav')
    ? 'wav'
    : 'webm';

  const fileName =
    customName ||
    (fileOrBlob instanceof File && fileOrBlob.name ? fileOrBlob.name : `audio_${Date.now()}.${extension}`);

  try {
    const tursoUrl = await uploadMediaToTurso(fileOrBlob, fileName);
    return { audioUrl: tursoUrl };
  } catch (err) {
    console.warn('Falha ao enviar mídia para Turso:', err);
    // Fallback seguro APENAS para arquivos bem pequenos (< 700 KB em base64),
    // garantindo que NUNCA ultrapasse o limite de 1.048.576 bytes do Firestore.
    const base64 = await blobToBase64(fileOrBlob);
    if (base64.length < 700_000) {
      return { audioUrl: base64 };
    }
    throw new Error(
      'Não foi possível salvar o arquivo de mídia no servidor Turso. Verifique sua conexão e tente novamente.'
    );
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
