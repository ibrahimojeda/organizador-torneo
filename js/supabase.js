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

  const fileName = `${type}_${Date.now()}_${file.name}`;
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
async function uploadDojoLogo(dojoId, file) {
  const supabaseClient = window.supabase;
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Supabase no está inicializado.');
  }

  const fileName = `dojo_logos/${dojoId}_${Date.now()}_${file.name}`;
  const { data, error } = await supabaseClient.storage
    .from('tournament-assets')
    .upload(fileName, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabaseClient.storage
    .from('tournament-assets')
    .getPublicUrl(fileName);

  const { error: updateError } = await supabaseClient
    .from('dojos')
    .update({ logo_url: publicUrl })
    .eq('id', dojoId);

  if (updateError) throw updateError;
  return publicUrl;
}