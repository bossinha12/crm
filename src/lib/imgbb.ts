/**
 * ImgBB Image Upload Service
 */

const IMGBB_API_KEY = '443e9a188288b2cc62322cadadc78d01';

export async function uploadToImgBB(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Falha no upload (${response.status} ${response.statusText})`);
  }

  const result = await response.json();

  if (result && result.success && result.data?.url) {
    // Return direct image display URL (display_url or url)
    return result.data.display_url || result.data.url;
  } else {
    const errorMsg = result?.error?.message || 'Não foi possível obter a URL da imagem enviada.';
    throw new Error(errorMsg);
  }
}
