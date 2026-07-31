// Fonction Supabase Edge : génère une URL signée pour uploader un fichier
// directement depuis le navigateur vers Cloudflare R2 (sans passer par un serveur).
//
// Déploiement : supabase functions deploy r2-upload-url
// Secrets nécessaires (supabase secrets set ...) :
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
// URL publique de ton bucket : soit le sous-domaine r2.dev, soit un domaine personnalisé.
const R2_PUBLIC_BASE_URL = Deno.env.get("R2_PUBLIC_BASE_URL")!;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // 1. Vérifier que la requête vient d'un utilisateur connecté
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // 2. Lire les infos du fichier à uploader
    const { fileName, fileType, kind } = await req.json();
    if (!fileName || !fileType || !["video", "thumbnail"].includes(kind)) {
      return new Response(JSON.stringify({ error: "Paramètres invalides" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 3. Construire une clé d'objet unique
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `${kind}/${userId}/${crypto.randomUUID()}-${safeName}`;

    // 4. Signer une requête PUT valable 10 minutes
    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${objectKey}`;
    const signedRequest = await r2.sign(endpoint, {
      method: "PUT",
      headers: { "Content-Type": fileType },
      aws: { signQuery: true, expires: 600 },
    });

    return new Response(
      JSON.stringify({
        uploadUrl: signedRequest.url,
        publicUrl: `${R2_PUBLIC_BASE_URL}/${objectKey}`,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
