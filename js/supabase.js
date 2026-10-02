/* ============================================================
   SUPABASE.JS — Utilidades de almacenamiento (imágenes)
   ============================================================ */

/**
 * Sube una imagen (banner o logo) al storage de Supabase
 * y actualiza el registro del torneo correspondiente.
 * @param {string} tournamentId
 * @param {string} type - 'banner' o 'logo'
 * @param {File} file
 * @returns {Promise<string>} URL pública de la imagen
 */
async function uploadImage(tournamentId, type, file) {
  const supabaseClient = window.supabase;
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Supabase no está inicializado.');
  }
  if (!file || !/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) throw new Error('La imagen debe ser PNG, JPG, SVG o WEBP.');
  if (file.size > 2 * 1024 * 1024) throw new Error('La imagen supera los 2MB.');

  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' }[file.type];
  const fileName = `${type}_${Date.now()}.${extension}`;
  const { data, error } = await supabaseClient.storage
    .from('tournament-assets')
    .upload(fileName, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabaseClient.storage
    .from('tournament-assets')
    .getPublicUrl(fileName);

  // Actualizar registro del torneo
  const updateData = {};
  if (type === 'banner') updateData.banner_url = publicUrl;
  if (type === 'logo') updateData.logo_url = publicUrl;

  const { error: updateError } = await supabaseClient
    .from('tournaments')
    .update(updateData)
    .eq('id', tournamentId);

  if (updateError) throw updateError;
  return publicUrl;
}

/**
 * Sube el logo de un dojo al storage de Supabase
 * y actualiza el registro del dojo correspondiente.
 * @param {string} dojoId
 * @param {File} file
 * @returns {Promise<string>} URL pública del logo
 */
const uploadDojoLogo = (dojoId, file) => Dojos.uploadLogo(dojoId, file);