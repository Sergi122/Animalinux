/**
 * Supabase Edge Function: validate-pack
 *
 * Se dispara desde un Database Webhook cuando se inserta una fila en `packs`.
 * Descarga el .alpack, lo valida y si algo falla borra el registro + el archivo.
 *
 * Desplegar con:
 *   supabase functions deploy validate-pack
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore — JSZip disponible como módulo ES
import JSZip from "https://esm.sh/jszip@3.10.1";

const PNG_MAGIC   = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_MB      = 50;
const MAX_UNZIP   = 200 * 1024 * 1024;  // 200 MB descomprimido
const MAX_FRAMES  = 500;
const SAFE_PATH   = /^poses\/[a-zA-Z0-9_-]{1,32}\/frame_\d{4}\.png$/;

function isPng(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf.slice(0, 8));
  return PNG_MAGIC.every((v, i) => b[i] === v);
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const pack = payload.record;
    if (!pack?.id || !pack?.file_path) {
      return new Response("no pack data", { status: 400 });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Descargar el archivo desde Storage ────────────────────────────
    const { data: fileData, error: dlErr } = await sb.storage
      .from("packs")
      .download(pack.file_path);

    if (dlErr || !fileData) {
      await rejectPack(sb, pack, "No se pudo descargar el archivo.");
      return new Response("download error", { status: 200 });
    }

    if (fileData.size > MAX_MB * 1024 * 1024) {
      await rejectPack(sb, pack, `Archivo supera ${MAX_MB} MB.`);
      return new Response("too large", { status: 200 });
    }

    // ── Validar ZIP ───────────────────────────────────────────────────
    let zip: any;
    try {
      zip = await JSZip.loadAsync(await fileData.arrayBuffer());
    } catch {
      await rejectPack(sb, pack, "No es un ZIP válido.");
      return new Response("invalid zip", { status: 200 });
    }

    // ── mascot.json ───────────────────────────────────────────────────
    const jsonEntry = zip.file("mascot.json");
    if (!jsonEntry) {
      await rejectPack(sb, pack, "Falta mascot.json.");
      return new Response("no json", { status: 200 });
    }
    let meta: any;
    try {
      meta = JSON.parse(await jsonEntry.async("string"));
    } catch {
      await rejectPack(sb, pack, "mascot.json corrupto.");
      return new Response("bad json", { status: 200 });
    }
    if (meta.format !== "animalinux-pack") {
      await rejectPack(sb, pack, "Formato no reconocido.");
      return new Response("bad format", { status: 200 });
    }

    // ── Validar rutas y frames ────────────────────────────────────────
    let totalBytes = 0;
    let frameCount = 0;
    for (const [name, entry] of Object.entries<any>(zip.files)) {
      if (entry.dir || name === "mascot.json") continue;
      if (!SAFE_PATH.test(name)) {
        await rejectPack(sb, pack, `Ruta ilegal: "${name}"`);
        return new Response("bad path", { status: 200 });
      }
      const buf: ArrayBuffer = await entry.async("arraybuffer");
      totalBytes += buf.byteLength;
      if (totalBytes > MAX_UNZIP) {
        await rejectPack(sb, pack, "Contenido descomprimido demasiado grande.");
        return new Response("zip bomb", { status: 200 });
      }
      if (!isPng(buf)) {
        await rejectPack(sb, pack, `"${name}" no es un PNG real.`);
        return new Response("fake png", { status: 200 });
      }
      frameCount++;
      if (frameCount > MAX_FRAMES) {
        await rejectPack(sb, pack, `Demasiados frames (máx ${MAX_FRAMES}).`);
        return new Response("too many frames", { status: 200 });
      }
    }

    // ── Todo OK → marcar como verificado ─────────────────────────────
    await sb.from("packs").update({ verified: true }).eq("id", pack.id);
    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("validate-pack error:", err);
    return new Response("internal error", { status: 500 });
  }
});

async function rejectPack(sb: any, pack: any, reason: string) {
  console.warn(`[validate-pack] RECHAZADO ${pack.id}: ${reason}`);
  // Borrar archivo del storage
  await sb.storage.from("packs").remove([pack.file_path]);
  if (pack.preview_path) {
    await sb.storage.from("previews").remove([pack.preview_path]);
  }
  // Borrar registro de la BD
  await sb.from("packs").delete().eq("id", pack.id);
}
