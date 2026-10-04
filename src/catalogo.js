// Lê as subpastas de MEDIA_DIR (uma por bicicleta) e monta o catálogo.
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

export const mimeDe = (arquivo) => MIME[extname(arquivo).toLowerCase()];

// "Aro16 masc" -> "Aro 16 Masculina", "Aro20BMX" -> "Aro 20 BMX"
export function nomeBonito(pasta) {
  return pasta
    .replace(/^aro\s*(\d+)\s*/i, 'Aro $1 ')
    .replace(/\bmasc\b/i, 'Masculina')
    .replace(/\bfem\b/i, 'Feminina')
    .replace(/\bfree ride\b/i, 'Free Ride')
    .trim();
}

export function carregarCatalogo(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const arquivos = readdirSync(join(dir, d.name))
        .filter((f) => mimeDe(f))
        .sort()
        .map((f) => ({
          nome: f,
          tipo: mimeDe(f).startsWith('video') ? 'video' : 'image',
          mimetype: mimeDe(f),
          mb: statSync(join(dir, d.name, f)).size / 1048576,
        }));
      const aro = Number(/aro\s*(\d+)/i.exec(d.name)?.[1]) || null;
      // F/M pelo nome da pasta; BMX, Free Ride e sem gênero valem para os dois
      const tipo = /\bfem/i.test(d.name) ? 'F' : /\bmasc/i.test(d.name) ? 'M' : null;
      return { pasta: d.name, nome: nomeBonito(d.name), aro, tipo, arquivos };
    })
    .filter((b) => b.arquivos.length)
    .sort((a, b) => a.pasta.localeCompare(b.pasta, 'pt-BR', { numeric: true }));
}
