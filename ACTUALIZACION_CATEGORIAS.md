# Actualización de categorías y dojos

Antes de usar la nueva versión, ejecutar en el SQL Editor del proyecto Supabase:

1. `supabase-migrations/009_fix_dojos_permissions.sql` si aún no se aplicó.
2. `supabase-migrations/012_add_kata_mode.sql` si aún no se aplicó.
3. `supabase-migrations/013_guided_category_update.sql`.
4. `supabase-migrations/014_edit_bracket_registrations.sql` para quitar/mover
   inscripciones con llaves y permitir rehacer categorías con resultados.

Quitar/mover con combates exige confirmar y escribir REHACER. Se borran todos los
combates de origen y, al mover, de destino; las otras categorías se conservan.
Luego usar Generar Llaves en las categorías afectadas. Regenerar también permite
reiniciar resultados confirmados. Si la generación posterior falla, las llaves
anteriores ya se han borrado: corregir el error y volver a generar.

No ejecutar todo el esquema como sustituto de estas migraciones. Hacer un respaldo
antes de aceptar cambios que impliquen borrar combates.

En Admin → Categorías → Actualizar formato de edades se revisa cada categoría.
Cancelar una decisión conserva esa categoría. Las decisiones anteriores aceptadas
ya están guardadas. Cada aplicación es transaccional: un error revierte esa categoría.
Las categorías originales, nombres personalizados, tatamis y reglas no se eliminan.
Las nuevas categorías copian los ajustes del origen; los destinos existentes mantienen
los suyos. Se conservan los IDs, seeds y estado de las inscripciones movidas.
Las fusiones/manuales requieren decisión del usuario. Si hay combates en origen o
destino, se solicita confirmación adicional y escribir ACTUALIZAR para borrarlos.
Las llaves no se regeneran automáticamente. Los duplicados en destino bloquean la
operación, sin eliminar ninguna inscripción.

Admin puede editar/eliminar dojos visibles de sus torneos; Super Admin puede gestionar
todos. Son dojos globales: editar/eliminar afecta a los torneos que los usan.
Eliminar un dojo conserva estudiantes y resultados (dojo_id pasa a NULL).

País vacío al guardar competidor significa heredar del dojo. El país explícito es
manual y no cambia con el dojo. Por seguridad, los países ya guardados se consideran
manuales: no se puede distinguir retrospectivamente su origen. Para que un estudiante
existente herede, editarlo y seleccionar “Heredar país del dojo”. Los triggers sincronizan
el país heredado para que también se vea en las consultas de mesa y pantalla.

Validación local: `node tests/guided-update.test.js`.
La migración debe validarse en Supabase; las pruebas locales no ejecutan PostgreSQL.
Pocket Torneo no forma parte de esta actualización.