// Solmar Heat — the entry program (Node 22, standard library only).
//
// The game is plain static files in game/ (game/index.html plus its ES
// modules, three.js vendored under game/vendor/, no network request at play
// time). This program hands it in: it copies game/ and screenshots/ from
// beside this file into the output directory and writes dossier.json, the
// summary the judge reads, using the kit's vendored make.fun library.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countTree(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countTree(full);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}

function handIn() {
  mkdirSync(destination, { recursive: true });
  cpSync(join(root, 'game'), join(destination, 'game'), { recursive: true });
  const shotsDir = join(root, 'screenshots');
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(destination, 'screenshots'), { recursive: true });
  }
  const game = countTree(join(destination, 'game'));
  // The scorer's own caps: text_max_bytes shapes the dossier bytes; the
  // rest refuse an entry the scorer would refuse (more than 4 screenshots
  // or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
  // files in all; a path under game/ over 1000 bytes).
  writeFileSync(
    join(destination, 'dossier.json'),
    buildDossier(destination, {
      text_max_bytes: 163840,
      screenshots: { max: 4, max_bytes: 262144 },
      game_max_files: 993,
      game_max_bytes: 50331648,
      game_path_max_bytes: 1000,
    }),
  );
  const shots = existsSync(join(destination, 'screenshots'))
    ? readdirSync(join(destination, 'screenshots')).sort()
    : [];
  const dossierBytes = statSync(join(destination, 'dossier.json')).size;
  console.log(`Solmar Heat handed in: game/ ${game.files} files, ${game.bytes} bytes; ${shots.length} screenshots (${shots.join(', ')}); dossier.json ${dossierBytes} bytes.`);
}

handIn();
