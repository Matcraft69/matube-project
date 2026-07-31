import { supabase } from "./supabaseClient";

/* ------------------------------------------------------------------ */
/* Authentification                                                    */
/* ------------------------------------------------------------------ */

export async function signUp({ email, password, username }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return data.subscription;
}

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------------ */
/* Vidéos                                                              */
/* ------------------------------------------------------------------ */

// Récupère les vidéos, avec le profil du créateur, filtrées par catégorie et recherche.
export async function fetchVideos({ category, search } = {}) {
  let query = supabase
    .from("videos")
    .select(
      `id, title, description, category, video_url, thumbnail_url,
       duration_seconds, views_count, likes_count, created_at,
       profiles:user_id ( id, username, avatar_url, verified )`
    )
    .order("created_at", { ascending: false });

  if (category && category !== "Tout") {
    query = query.eq("category", category);
  }
  if (search && search.trim() !== "") {
    query = query.ilike("title", `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createVideo({
  userId,
  title,
  description,
  category,
  videoUrl,
  thumbnailUrl,
  durationSeconds,
}) {
  const { data, error } = await supabase
    .from("videos")
    .insert({
      user_id: userId,
      title,
      description,
      category,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      duration_seconds: Math.round(durationSeconds || 0),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function recordView(videoId, userId) {
  // Ne bloque jamais l'affichage si l'enregistrement de la vue échoue.
  const { error } = await supabase
    .from("views")
    .insert({ video_id: videoId, viewer_id: userId ?? null });
  if (error) console.warn("Impossible d'enregistrer la vue :", error.message);
}

/* ------------------------------------------------------------------ */
/* Likes                                                                */
/* ------------------------------------------------------------------ */

export async function fetchUserLikes(userId, videoIds) {
  if (!userId || videoIds.length === 0) return [];
  const { data, error } = await supabase
    .from("likes")
    .select("video_id")
    .eq("user_id", userId)
    .in("video_id", videoIds);
  if (error) throw error;
  return data.map((row) => row.video_id);
}

export async function toggleLike(videoId, userId, isLiked) {
  if (isLiked) {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("video_id", videoId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("likes")
      .insert({ video_id: videoId, user_id: userId });
    if (error) throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Abonnements                                                         */
/* ------------------------------------------------------------------ */

export async function fetchSubscriptions(subscriberId) {
  if (!subscriberId) return [];
  const { data, error } = await supabase
    .from("subscriptions")
    .select("channel_id, profiles:channel_id ( id, username, avatar_url )")
    .eq("subscriber_id", subscriberId);
  if (error) throw error;
  return data.map((row) => row.profiles);
}

export async function toggleSubscription(channelId, subscriberId, isSubscribed) {
  if (isSubscribed) {
    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("channel_id", channelId)
      .eq("subscriber_id", subscriberId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("subscriptions")
      .insert({ channel_id: channelId, subscriber_id: subscriberId });
    if (error) throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Upload de fichiers vers Cloudflare R2 (via la fonction Edge)         */
/* ------------------------------------------------------------------ */

async function requestUploadUrl({ file, kind }) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Connecte-toi avant d'importer une vidéo.");

  const { data, error } = await supabase.functions.invoke("r2-upload-url", {
    body: { fileName: file.name, fileType: file.type, kind },
  });
  if (error) throw error;
  return data; // { uploadUrl, publicUrl }
}

// Upload un fichier (vidéo ou miniature) directement vers R2 et renvoie son URL publique.
export async function uploadFileToR2(file, kind) {
  const { uploadUrl, publicUrl } = await requestUploadUrl({ file, kind });

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putResponse.ok) {
    throw new Error("L'envoi du fichier vers le stockage a échoué.");
  }
  return publicUrl;
}

// Lit la durée (en secondes) d'un fichier vidéo côté navigateur, avant l'upload.
export function readVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration || 0);
    };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}
