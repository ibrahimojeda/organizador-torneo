import { supabase } from '../lib/supabase';

export const uploadImage = async (tournamentId, type, file) => {
  const fileName = `${type}_${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage
    .from('tournament-assets')
    .upload(fileName, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('tournament-assets')
    .getPublicUrl(fileName);

  // Update tournament record
  const updateData = {};
  if (type === 'banner') updateData.banner_url = publicUrl;
  if (type === 'logo') updateData.logo_url = publicUrl;

  const { error: updateError } = await supabase
    .from('tournaments')
    .update(updateData)
    .eq('id', tournamentId);

  if (updateError) throw updateError;
  return publicUrl;
};

export const uploadDojoLogo = async (dojoId, file) => {
  const fileName = `dojo_logos/${dojoId}_${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage
    .from('tournament-assets')
    .upload(fileName, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('tournament-assets')
    .getPublicUrl(fileName);

  const { error: updateError } = await supabase
    .from('dojos')
    .update({ logo_url: publicUrl })
    .eq('id', dojoId);

  if (updateError) throw updateError;
  return publicUrl;
};

export const uploadImageAndDojoLogo = {
  uploadImage,
  uploadDojoLogo
};