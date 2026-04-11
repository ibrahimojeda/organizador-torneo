/**
 * Script para crear la cuenta del Super Administrador.
 * Ejecutar UNA sola vez: node create-superadmin.js
 *
 * Requisito: desactivar "Email Confirmation" en Supabase → Authentication → Settings
 * antes de ejecutar.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = 'https://ubhmahzqakgqhcvvnpzv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaG1haHpxYWtncWhjdnZucHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDIwNDAsImV4cCI6MjA5MTI3ODA0MH0.cX0HB_3zQLRS8w1MCxedc53EN1OZSf1itSCJoJco_TA';

const EMAIL    = 'superadmin@torneo.app';
const PASSWORD = 'TorneoAdmin2026!';

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  console.log(`Creando cuenta para: ${EMAIL}`);
  const { data, error } = await supabase.auth.signUp({ email: EMAIL, password: PASSWORD });

  if (error) {
    console.error('❌ Error al crear la cuenta:', error.message);
    process.exit(1);
  }

  const userId = data.user?.id;
  if (!userId) {
    console.error('❌ No se recibió el ID del usuario. Revisa si Email Confirmation está desactivado en Supabase.');
    process.exit(1);
  }

  console.log(`✅ Cuenta creada. ID: ${userId}`);
  console.log('Asignando rol super_admin...');

  const { error: roleError } = await supabase
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', userId);

  if (roleError) {
    console.error('❌ Error al asignar rol:', roleError.message);
    console.log(`\nEjecuta manualmente en Supabase SQL Editor:\n  UPDATE profiles SET role = 'super_admin' WHERE id = '${userId}';`);
    process.exit(1);
  }

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  ✅ SUPER ADMIN CREADO EXITOSAMENTE');
  console.log('══════════════════════════════════════════════');
  console.log(`  Email:      ${EMAIL}`);
  console.log(`  Contraseña: ${PASSWORD}`);
  console.log(`  ID:         ${userId}`);
  console.log('══════════════════════════════════════════════');
}

main();
