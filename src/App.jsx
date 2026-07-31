import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Upload,
  Bell,
  Home,
  Flame,
  Users,
  ListVideo,
  History,
  Heart,
  Menu,
  CheckCircle2,
  Compass,
  X,
  LogOut,
} from "lucide-react";
import {
  onAuthStateChange,
  getCurrentSession,
  fetchProfile,
  fetchVideos,
  fetchUserLikes,
  toggleLike,
  fetchSubscriptions,
  toggleSubscription,
  recordView,
  signIn,
  signUp,
  signOut,
  createVideo,
  uploadFileToR2,
  readVideoDuration,
} from "./lib/api";

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  "Tout",
  "Gaming",
  "Musique",
  "Cuisine",
  "Tech",
  "Sport",
  "Vlogs",
  "Science",
  "Humour",
  "Voyage",
  "Bricolage",
];

const NAV_ITEMS = [
  { label: "Accueil", icon: Home, active: true },
  { label: "Tendances", icon: Flame, active: false },
  { label: "Abonnements", icon: Users, active: false },
  { label: "Explorer", icon: Compass, active: false },
];

const NAV_ITEMS_2 = [
  { label: "Bibliothèque", icon: ListVideo, active: false },
  { label: "Historique", icon: History, active: false },
];

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

function formatViews(n) {
  const value = n || 0;
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1).replace(".", ",")} M`;
  }
  if (value >= 1000) return `${Math.round(value / 1000)} k`;
  return `${value}`;
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, "0")}`;
}

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `il y a ${weeks} sem.`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  return `il y a ${Math.floor(days / 365)} an(s)`;
}

function avatarUrl(profile) {
  if (profile?.avatar_url) return profile.avatar_url;
  const seed = encodeURIComponent(profile?.username || profile?.id || "matube");
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}&backgroundColor=1b1e29,232733,2e3341`;
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  const [activeCategory, setActiveCategory] = useState("Tout");
  const [query, setQuery] = useState("");

  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState(null);

  const [likedIds, setLikedIds] = useState(new Set());
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscribedChannelIds, setSubscribedChannelIds] = useState(new Set());

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const userId = session?.user?.id ?? null;

  /* ---------------- Session ---------------- */

  useEffect(() => {
    getCurrentSession().then(setSession);
    const subscription = onAuthStateChange((s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    fetchProfile(userId).then(setProfile).catch(() => setProfile(null));
  }, [userId]);

  /* ---------------- Vidéos ---------------- */

  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    setVideosError(null);
    try {
      const data = await fetchVideos({ category: activeCategory, search: query });
      setVideos(data);
      if (userId) {
        const liked = await fetchUserLikes(userId, data.map((v) => v.id));
        setLikedIds(new Set(liked));
      } else {
        setLikedIds(new Set());
      }
    } catch (err) {
      setVideosError(err.message || "Impossible de charger les vidéos.");
    } finally {
      setVideosLoading(false);
    }
  }, [activeCategory, query, userId]);

  useEffect(() => {
    const timeout = setTimeout(loadVideos, 250); // léger debounce sur la recherche
    return () => clearTimeout(timeout);
  }, [loadVideos]);

  /* ---------------- Abonnements ---------------- */

  useEffect(() => {
    if (!userId) {
      setSubscriptions([]);
      setSubscribedChannelIds(new Set());
      return;
    }
    fetchSubscriptions(userId).then((list) => {
      setSubscriptions(list);
      setSubscribedChannelIds(new Set(list.map((c) => c.id)));
    });
  }, [userId]);

  /* ---------------- Actions ---------------- */

  function requireAuth() {
    if (!userId) {
      setAuthMode("signin");
      setShowAuthModal(true);
      return false;
    }
    return true;
  }

  async function handleToggleLike(video) {
    if (!requireAuth()) return;
    const isLiked = likedIds.has(video.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      isLiked ? next.delete(video.id) : next.add(video.id);
      return next;
    });
    setVideos((prev) =>
      prev.map((v) =>
        v.id === video.id
          ? { ...v, likes_count: v.likes_count + (isLiked ? -1 : 1) }
          : v
      )
    );
    try {
      await toggleLike(video.id, userId, isLiked);
    } catch {
      loadVideos(); // resynchronise en cas d'échec
    }
  }

  async function handleToggleSubscription(channel) {
    if (!requireAuth()) return;
    if (channel.id === userId) return;
    const isSubscribed = subscribedChannelIds.has(channel.id);
    setSubscribedChannelIds((prev) => {
      const next = new Set(prev);
      isSubscribed ? next.delete(channel.id) : next.add(channel.id);
      return next;
    });
    setSubscriptions((prev) =>
      isSubscribed ? prev.filter((c) => c.id !== channel.id) : [...prev, channel]
    );
    try {
      await toggleSubscription(channel.id, userId, isSubscribed);
    } catch {
      fetchSubscriptions(userId).then((list) => {
        setSubscriptions(list);
        setSubscribedChannelIds(new Set(list.map((c) => c.id)));
      });
    }
  }

  function handleOpenVideo(video) {
    setActiveVideo(video);
    recordView(video.id, userId);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    const form = new FormData(e.target);
    const email = form.get("email");
    const password = form.get("password");
    const username = form.get("username");
    try {
      if (authMode === "signup") {
        await signUp({ email, password, username });
      } else {
        await signIn({ email, password });
      }
      setShowAuthModal(false);
    } catch (err) {
      setAuthError(err.message || "Une erreur est survenue.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    if (!requireAuth()) return;
    setUploadError(null);
    setUploadLoading(true);
    const form = new FormData(e.target);
    const title = form.get("title");
    const description = form.get("description");
    const category = form.get("category");
    const videoFile = form.get("videoFile");
    const thumbnailFile = form.get("thumbnailFile");

    if (!videoFile || videoFile.size === 0) {
      setUploadError("Choisis un fichier vidéo.");
      setUploadLoading(false);
      return;
    }

    try {
      setUploadStatus("Analyse de la vidéo…");
      const duration = await readVideoDuration(videoFile);

      setUploadStatus("Envoi de la vidéo vers le stockage…");
      const videoUrl = await uploadFileToR2(videoFile, "video");

      let thumbnailUrl = null;
      if (thumbnailFile && thumbnailFile.size > 0) {
        setUploadStatus("Envoi de la miniature…");
        thumbnailUrl = await uploadFileToR2(thumbnailFile, "thumbnail");
      }

      setUploadStatus("Publication…");
      await createVideo({
        userId,
        title,
        description,
        category,
        videoUrl,
        thumbnailUrl,
        durationSeconds: duration,
      });

      setShowUploadModal(false);
      setUploadStatus("");
      loadVideos();
    } catch (err) {
      setUploadError(err.message || "L'import a échoué.");
    } finally {
      setUploadLoading(false);
    }
  }

  const emptyMessage = useMemo(() => {
    if (videosLoading) return null;
    if (videosError) return videosError;
    if (videos.length === 0 && query.trim() !== "") {
      return "Aucune vidéo ne correspond à cette recherche.";
    }
    if (videos.length === 0) {
      return "Aucune vidéo publiée pour l'instant. Sois le premier à importer un contenu !";
    }
    return null;
  }, [videos, videosLoading, videosError, query]);

  /* ------------------------------------------------------------------ */

  return (
    <div className="mtb-root">
      <GlobalStyles />

      <header className="mtb-header">
        <button
          className="mtb-menu-btn"
          aria-label="Afficher ou masquer le menu"
          onClick={() => setSidebarOpen((s) => !s)}
        >
          <Menu size={20} />
        </button>

        <a className="mtb-logo" href="#" aria-label="Matube, accueil">
          <span className="mtb-logo-mark mtb-display">
            MA<span className="mtb-logo-play">▶</span>UBE
          </span>
          <span className="mtb-rec-dot" aria-hidden="true" />
        </a>

        <div className="mtb-search-wrap">
          <div className="mtb-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Rechercher sur Matube"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher une vidéo"
            />
          </div>
        </div>

        <div className="mtb-header-actions">
          <button
            className="mtb-upload-btn"
            onClick={() => (requireAuth() ? setShowUploadModal(true) : null)}
          >
            <Upload size={16} />
            <span>Importer</span>
          </button>
          <button className="mtb-icon-btn" aria-label="Notifications">
            <Bell size={19} />
          </button>
          {session ? (
            <button
              className="mtb-icon-btn"
              aria-label="Se déconnecter"
              onClick={() => signOut()}
              title={profile?.username}
            >
              <img className="mtb-avatar" src={avatarUrl(profile)} alt="" />
            </button>
          ) : (
            <button
              className="mtb-upload-btn"
              onClick={() => {
                setAuthMode("signin");
                setShowAuthModal(true);
              }}
            >
              Se connecter
            </button>
          )}
        </div>
      </header>

      <div className="mtb-body">
        <aside className={`mtb-sidebar ${sidebarOpen ? "" : "mtb-collapsed"}`}>
          <nav className="mtb-nav-group">
            {NAV_ITEMS.map((item) => (
              <div
                key={item.label}
                className={`mtb-nav-item ${item.active ? "mtb-nav-active" : ""}`}
              >
                <item.icon size={19} />
                {item.label}
              </div>
            ))}
          </nav>

          <div className="mtb-nav-divider" />

          <nav className="mtb-nav-group">
            {NAV_ITEMS_2.map((item) => (
              <div key={item.label} className="mtb-nav-item">
                <item.icon size={19} />
                {item.label}
              </div>
            ))}
          </nav>

          <div className="mtb-nav-divider" />

          <div className="mtb-nav-label">Abonnements</div>
          {subscriptions.length === 0 ? (
            <div className="mtb-sub-empty">
              {session ? "Aucun abonnement pour l'instant." : "Connecte-toi pour voir tes abonnements."}
            </div>
          ) : (
            subscriptions.map((c) => (
              <div key={c.id} className="mtb-sub-item">
                <img className="mtb-sub-avatar" src={avatarUrl(c)} alt="" />
                <span className="mtb-sub-name">{c.username}</span>
              </div>
            ))
          )}
        </aside>

        <main className="mtb-main">
          <div className="mtb-chips" role="tablist" aria-label="Filtrer par catégorie">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                role="tab"
                aria-selected={activeCategory === cat}
                className={`mtb-chip ${activeCategory === cat ? "mtb-chip-active" : ""}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {videosLoading ? (
            <div className="mtb-empty">Chargement des vidéos…</div>
          ) : emptyMessage ? (
            <div className="mtb-empty">{emptyMessage}</div>
          ) : (
            <div className="mtb-grid">
              {videos.map((v) => {
                const isLiked = likedIds.has(v.id);
                const isOwnVideo = v.profiles?.id === userId;
                const isSubscribed = subscribedChannelIds.has(v.profiles?.id);
                return (
                  <article className="mtb-card" key={v.id}>
                    <div
                      className="mtb-thumb-frame"
                      onClick={() => handleOpenVideo(v)}
                      role="button"
                      tabIndex={0}
                    >
                      {v.thumbnail_url ? (
                        <img src={v.thumbnail_url} alt="" loading="lazy" />
                      ) : (
                        <div className="mtb-thumb-fallback" />
                      )}
                      <span className="mtb-corner mtb-corner-tl" />
                      <span className="mtb-corner mtb-corner-tr" />
                      <span className="mtb-corner mtb-corner-bl" />
                      <span className="mtb-corner mtb-corner-br" />
                      <span className="mtb-duration mtb-mono">
                        {formatDuration(v.duration_seconds)}
                      </span>
                    </div>

                    <div className="mtb-card-meta">
                      <img className="mtb-card-avatar" src={avatarUrl(v.profiles)} alt="" />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3
                          className="mtb-card-title"
                          onClick={() => handleOpenVideo(v)}
                          role="button"
                          tabIndex={0}
                        >
                          {v.title}
                        </h3>
                        <div className="mtb-card-channel">
                          <span>{v.profiles?.username}</span>
                          {v.profiles?.verified && (
                            <CheckCircle2 size={13} className="mtb-verified" />
                          )}
                          {!isOwnVideo && (
                            <button
                              className={`mtb-sub-pill ${isSubscribed ? "mtb-sub-pill-active" : ""}`}
                              onClick={() => handleToggleSubscription(v.profiles)}
                            >
                              {isSubscribed ? "Abonné" : "S'abonner"}
                            </button>
                          )}
                        </div>
                        <div className="mtb-card-stats mtb-mono">
                          {formatViews(v.views_count)} vues · {timeAgo(v.created_at)}
                        </div>
                      </div>
                      <button
                        className={`mtb-like-btn ${isLiked ? "mtb-like-active" : ""}`}
                        onClick={() => handleToggleLike(v)}
                        aria-label="Aimer cette vidéo"
                      >
                        <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                        <span className="mtb-mono">{formatViews(v.likes_count)}</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {activeVideo && (
        <div className="mtb-overlay" onClick={() => setActiveVideo(null)}>
          <div className="mtb-watch-dialog" onClick={(e) => e.stopPropagation()}>
            <button className="mtb-close-btn" onClick={() => setActiveVideo(null)} aria-label="Fermer">
              <X size={18} />
            </button>
            <video className="mtb-player" src={activeVideo.video_url} controls autoPlay />
            <h3 className="mtb-card-title" style={{ marginTop: 14 }}>{activeVideo.title}</h3>
            <div className="mtb-card-stats mtb-mono">
              {formatViews(activeVideo.views_count + 1)} vues · {timeAgo(activeVideo.created_at)}
            </div>
            {activeVideo.description && (
              <p className="mtb-description">{activeVideo.description}</p>
            )}
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="mtb-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="mtb-dialog" onClick={(e) => e.stopPropagation()}>
            <button className="mtb-close-btn" onClick={() => setShowAuthModal(false)} aria-label="Fermer">
              <X size={18} />
            </button>
            <div className="mtb-tabs">
              <button
                className={`mtb-tab ${authMode === "signin" ? "mtb-tab-active" : ""}`}
                onClick={() => setAuthMode("signin")}
              >
                Se connecter
              </button>
              <button
                className={`mtb-tab ${authMode === "signup" ? "mtb-tab-active" : ""}`}
                onClick={() => setAuthMode("signup")}
              >
                Créer un compte
              </button>
            </div>
            <form onSubmit={handleAuthSubmit} className="mtb-form">
              {authMode === "signup" && (
                <input name="username" placeholder="Nom d'utilisateur" required />
              )}
              <input name="email" type="email" placeholder="Adresse e-mail" required />
              <input name="password" type="password" placeholder="Mot de passe" minLength={6} required />
              {authError && <div className="mtb-form-error">{authError}</div>}
              <button type="submit" className="mtb-submit-btn" disabled={authLoading}>
                {authLoading ? "Un instant…" : authMode === "signup" ? "Créer mon compte" : "Se connecter"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="mtb-overlay" onClick={() => !uploadLoading && setShowUploadModal(false)}>
          <div className="mtb-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              className="mtb-close-btn"
              onClick={() => !uploadLoading && setShowUploadModal(false)}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
            <h3 className="mtb-dialog-title mtb-display">Importer une vidéo</h3>
            <form onSubmit={handleUploadSubmit} className="mtb-form">
              <label className="mtb-field-label">Fichier vidéo</label>
              <input name="videoFile" type="file" accept="video/*" required />
              <label className="mtb-field-label">Miniature (optionnel)</label>
              <input name="thumbnailFile" type="file" accept="image/*" />
              <input name="title" placeholder="Titre de la vidéo" required maxLength={100} />
              <textarea name="description" placeholder="Description" rows={3} />
              <select name="category" defaultValue="Tout">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {uploadError && <div className="mtb-form-error">{uploadError}</div>}
              <button type="submit" className="mtb-submit-btn" disabled={uploadLoading}>
                {uploadLoading ? uploadStatus || "Envoi en cours…" : "Publier"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles (identique à l'étape précédente + nouveaux composants)       */
/* ------------------------------------------------------------------ */

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

      .mtb-root {
        --bg: #12141c;
        --surface: #1b1e29;
        --surface-alt: #232733;
        --surface-hover: #2a2f3d;
        --border: #2e3341;
        --text: #ecece2;
        --text-dim: #9aa0af;
        --text-faint: #656b7a;
        --rec: #ff4b3e;
        --amber: #ffb238;
        --teal: #3fa796;
        font-family: 'Inter', system-ui, sans-serif;
        background: var(--bg);
        color: var(--text);
        min-height: 100vh;
        width: 100%;
        box-sizing: border-box;
      }
      .mtb-root *, .mtb-root *::before, .mtb-root *::after { box-sizing: border-box; }
      .mtb-mono { font-family: 'IBM Plex Mono', monospace; }
      .mtb-display { font-family: 'Space Grotesk', sans-serif; }

      .mtb-header {
        position: sticky; top: 0; z-index: 20;
        display: flex; align-items: center; gap: 18px;
        height: 64px; padding: 0 20px;
        background: var(--bg); border-bottom: 1px solid var(--border);
      }
      .mtb-menu-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 8px; border-radius: 6px; display: flex; }
      .mtb-menu-btn:hover { background: var(--surface); color: var(--text); }
      .mtb-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; flex-shrink: 0; }
      .mtb-logo-mark { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; color: var(--text); display: flex; align-items: center; gap: 2px; }
      .mtb-logo-play { color: var(--rec); font-size: 15px; transform: translateY(-1px); }
      .mtb-rec-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--rec); animation: mtb-pulse 2s ease-in-out infinite; }
      @keyframes mtb-pulse {
        0% { box-shadow: 0 0 0 0 rgba(255,75,62,0.55); }
        70% { box-shadow: 0 0 0 6px rgba(255,75,62,0); }
        100% { box-shadow: 0 0 0 0 rgba(255,75,62,0); }
      }
      .mtb-search-wrap { flex: 1; display: flex; justify-content: center; }
      .mtb-search { width: 100%; max-width: 560px; display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 22px; padding: 0 16px; height: 40px; }
      .mtb-search:focus-within { border-color: var(--rec); }
      .mtb-search input { background: none; border: none; outline: none; color: var(--text); font-size: 14px; width: 100%; font-family: 'Inter', sans-serif; }
      .mtb-search input::placeholder { color: var(--text-faint); }
      .mtb-search svg { color: var(--text-faint); flex-shrink: 0; }
      .mtb-header-actions { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
      .mtb-upload-btn { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
      .mtb-upload-btn:hover { border-color: var(--rec); color: var(--rec); }
      .mtb-icon-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 8px; border-radius: 50%; display: flex; }
      .mtb-icon-btn:hover { background: var(--surface); color: var(--text); }
      .mtb-avatar { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); object-fit: cover; }

      .mtb-body { display: flex; align-items: flex-start; }
      .mtb-sidebar { position: sticky; top: 64px; height: calc(100vh - 64px); width: 232px; flex-shrink: 0; border-right: 1px solid var(--border); padding: 16px 10px; overflow-y: auto; transition: width 0.18s ease, padding 0.18s ease; }
      .mtb-sidebar.mtb-collapsed { width: 0; padding: 16px 0; overflow: hidden; border-right: none; }
      .mtb-nav-group { margin-bottom: 14px; }
      .mtb-nav-item { display: flex; align-items: center; gap: 14px; padding: 9px 12px; border-radius: 8px; color: var(--text-dim); font-size: 13.5px; font-weight: 500; cursor: pointer; white-space: nowrap; }
      .mtb-nav-item:hover { background: var(--surface); color: var(--text); }
      .mtb-nav-item.mtb-nav-active { background: var(--surface-alt); color: var(--text); border-left: 3px solid var(--rec); padding-left: 9px; }
      .mtb-nav-divider { height: 1px; background: var(--border); margin: 12px 4px; }
      .mtb-nav-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); padding: 6px 12px; font-weight: 600; }
      .mtb-sub-item { display: flex; align-items: center; gap: 12px; padding: 7px 12px; border-radius: 8px; cursor: default; color: var(--text-dim); font-size: 13px; }
      .mtb-sub-item:hover { background: var(--surface); color: var(--text); }
      .mtb-sub-avatar { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; border: 1px solid var(--border); }
      .mtb-sub-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .mtb-sub-empty { padding: 6px 12px; font-size: 12px; color: var(--text-faint); line-height: 1.5; }

      .mtb-main { flex: 1; min-width: 0; padding: 18px 24px 60px; }
      .mtb-chips { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 18px; margin-bottom: 6px; scrollbar-width: none; }
      .mtb-chips::-webkit-scrollbar { display: none; }
      .mtb-chip { flex-shrink: 0; background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); font-size: 13px; font-weight: 500; padding: 7px 15px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
      .mtb-chip:hover { background: var(--surface-hover); color: var(--text); }
      .mtb-chip.mtb-chip-active { background: var(--text); color: var(--bg); border-color: var(--text); }

      .mtb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 26px 18px; }
      .mtb-card { }
      .mtb-thumb-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: var(--surface); border: 1px solid var(--border); cursor: pointer; }
      .mtb-thumb-frame img { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(0.92); transition: transform 0.35s ease, filter 0.35s ease; }
      .mtb-thumb-fallback { width: 100%; height: 100%; background: linear-gradient(135deg, var(--surface-alt), var(--surface)); }
      .mtb-card:hover .mtb-thumb-frame img { transform: scale(1.045); filter: saturate(1.05); }
      .mtb-thumb-frame::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.35) 100%); pointer-events: none; }
      .mtb-corner { position: absolute; width: 16px; height: 16px; opacity: 0; transition: opacity 0.2s ease; z-index: 2; }
      .mtb-card:hover .mtb-corner { opacity: 1; }
      .mtb-corner-tl { top: 6px; left: 6px; border-top: 2px solid var(--rec); border-left: 2px solid var(--rec); }
      .mtb-corner-tr { top: 6px; right: 6px; border-top: 2px solid var(--rec); border-right: 2px solid var(--rec); }
      .mtb-corner-bl { bottom: 6px; left: 6px; border-bottom: 2px solid var(--rec); border-left: 2px solid var(--rec); }
      .mtb-corner-br { bottom: 6px; right: 6px; border-bottom: 2px solid var(--rec); border-right: 2px solid var(--rec); }
      .mtb-duration { position: absolute; bottom: 6px; right: 6px; background: rgba(10,11,15,0.85); color: var(--text); font-size: 11.5px; padding: 2px 6px; border-radius: 4px; z-index: 3; }
      .mtb-card-meta { display: flex; gap: 10px; margin-top: 10px; align-items: flex-start; }
      .mtb-card-avatar { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; border: 1px solid var(--border); margin-top: 2px; }
      .mtb-card-title { font-size: 14.5px; font-weight: 600; line-height: 1.35; color: var(--text); cursor: pointer; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .mtb-card-channel { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-dim); margin-top: 4px; flex-wrap: wrap; }
      .mtb-verified { color: var(--teal); flex-shrink: 0; }
      .mtb-card-stats { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
      .mtb-sub-pill { background: none; border: 1px solid var(--border); color: var(--text-dim); font-size: 11px; padding: 2px 8px; border-radius: 12px; cursor: pointer; }
      .mtb-sub-pill:hover { border-color: var(--rec); color: var(--rec); }
      .mtb-sub-pill-active { background: var(--surface-alt); color: var(--text); }
      .mtb-like-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 4px; flex-shrink: 0; }
      .mtb-like-btn:hover { color: var(--rec); }
      .mtb-like-active { color: var(--rec); }
      .mtb-like-active span { color: var(--rec); }
      .mtb-like-btn span { font-size: 11px; }

      .mtb-empty { padding: 60px 0; text-align: center; color: var(--text-faint); font-size: 14px; }

      .mtb-overlay { position: fixed; inset: 0; background: rgba(10,11,15,0.75); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
      .mtb-dialog, .mtb-watch-dialog { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 26px; width: 100%; max-width: 420px; position: relative; }
      .mtb-watch-dialog { max-width: 720px; }
      .mtb-close-btn { position: absolute; top: 14px; right: 14px; background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 6px; border-radius: 50%; }
      .mtb-close-btn:hover { background: var(--surface-alt); color: var(--text); }
      .mtb-dialog-title { font-size: 19px; font-weight: 700; margin: 0 0 18px; }
      .mtb-tabs { display: flex; gap: 6px; margin-bottom: 18px; background: var(--surface-alt); border-radius: 10px; padding: 4px; }
      .mtb-tab { flex: 1; background: none; border: none; color: var(--text-dim); font-size: 13px; font-weight: 600; padding: 8px; border-radius: 8px; cursor: pointer; }
      .mtb-tab-active { background: var(--surface); color: var(--text); }
      .mtb-form { display: flex; flex-direction: column; gap: 10px; }
      .mtb-form input, .mtb-form textarea, .mtb-form select { background: var(--surface-alt); border: 1px solid var(--border); color: var(--text); padding: 10px 12px; border-radius: 8px; font-size: 13.5px; font-family: 'Inter', sans-serif; outline: none; }
      .mtb-form input:focus, .mtb-form textarea:focus, .mtb-form select:focus { border-color: var(--rec); }
      .mtb-form textarea { resize: vertical; }
      .mtb-field-label { font-size: 12px; color: var(--text-dim); margin-top: 4px; }
      .mtb-form-error { color: var(--rec); font-size: 12.5px; }
      .mtb-submit-btn { background: var(--rec); border: none; color: #12141c; font-weight: 700; font-size: 13.5px; padding: 11px; border-radius: 8px; cursor: pointer; margin-top: 6px; }
      .mtb-submit-btn:disabled { opacity: 0.6; cursor: wait; }
      .mtb-player { width: 100%; border-radius: 8px; background: #000; max-height: 60vh; }
      .mtb-description { font-size: 13px; color: var(--text-dim); margin-top: 10px; line-height: 1.5; }

      @media (max-width: 860px) {
        .mtb-sidebar { display: none; }
        .mtb-search-wrap { display: none; }
        .mtb-upload-btn span { display: none; }
      }
    `}</style>
  );
}
