# Activar complejos y cocheras

Esta actualización se ejecuta una sola vez y no elimina ni modifica los pagos existentes.

1. Abrí `migrations/002_complexes_cocheras.sql`.
2. Seleccioná todo con `Ctrl + A` y copiá con `Ctrl + C`.
3. Entrá al proyecto **Alquileres ING** en Supabase.
4. Abrí **SQL Editor → New query**.
5. Pegá el contenido con `Ctrl + V`.
6. Presioná **Run**.
7. Si aparece una advertencia, elegí **Run without RLS**. El script crea sus propias políticas RLS antes de confirmar.
8. El resultado esperado es **Success. No rows returned**.

La mejora agrega:

- catálogo de complejos;
- identificación de cada unidad o departamento;
- catálogo independiente de cocheras por complejo;
- asignaciones de cocheras a contratos con fechas e historial;
- bloqueo en base de datos para impedir asignaciones superpuestas;
- control para que cochera y unidad pertenezcan al mismo complejo.
