-- Quitar estados de inscripción: todo queda aceptado y sin control manual.
ALTER TABLE registrations ALTER COLUMN status SET DEFAULT 'accepted';
UPDATE registrations SET status = 'accepted' WHERE status IS DISTINCT FROM 'accepted';
NOTIFY pgrst, 'reload schema';