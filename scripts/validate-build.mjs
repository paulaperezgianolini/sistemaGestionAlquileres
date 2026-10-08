import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'dist/index.html',
  'dist/styles.css',
  'dist/monthly.css',
  'dist/app.js',
  'dist/cloud.mjs',
  'dist/csv.mjs',
  'dist/model.mjs',
  'supabase/migrations/002_complexes_cocheras.sql'
];

await Promise.all(requiredFiles.map((file) => access(file)));

const [html, cloud, parkingMigration] = await Promise.all([
  readFile('dist/index.html', 'utf8'),
  readFile('dist/cloud.mjs', 'utf8'),
  readFile('supabase/migrations/002_complexes_cocheras.sql', 'utf8')
]);

if (!html.includes('<title>Ámbito · Administración de alquileres</title>')) {
  throw new Error('No se encontró el documento principal del portal.');
}

if (!cloud.includes('https://iqaoveeivpafijdxzhmr.supabase.co')) {
  throw new Error('Falta la conexión con el proyecto Supabase.');
}

if (!cloud.includes('sb_publishable_')) {
  throw new Error('Falta la clave pública de Supabase.');
}

if (/service[_-]?role|sb_secret_/i.test(cloud)) {
  throw new Error('Se detectó una clave privada en el código del navegador.');
}

for (const requirement of ['parking_assignments_no_overlap','enable row level security','validate_parking_assignment','commit;']) {
  if (!parkingMigration.toLowerCase().includes(requirement)) {
    throw new Error(`La migración de cocheras está incompleta: ${requirement}`);
  }
}

console.log('Portal validado y listo para publicar en Vercel.');
