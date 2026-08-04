import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BUCKET_NAME } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const FACTION_LABEL = { WEI: "魏", SHU: "蜀", WU: "吴", QUN: "群", OTHER: "其他" };
const RATING_OPTIONS = ["超模", "夯", "一般", "拉"];

let allCards = [];        // full list from DB
let currentSession = [];  // cards added to the in-progress log

/* ---------------------------------------------------------
   Tab navigation
--------------------------------------------------------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

/* ---------------------------------------------------------
   Load all cards from Supabase
--------------------------------------------------------- */
async function loadCards() {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .order("faction", { ascending: true })
    .order("card_id", { ascending: true });

  if (error) {
    console.error(error);
    document.getElementById("card-grid").innerHTML =
      `<p style="color:#d17b7b">Failed to load cards: ${error.message}</p>`;
    return;
  }
  allCards = data || [];
  renderGrid("card-grid", allCards, { addable: false });
  renderGrid("log-card-grid", allCards, { addable: true, small: true });
  updateCardCount();
}

function updateCardCount() {
  document.getElementById("card-count").textContent = `${allCards.length} 张卡`;
}

/* ---------------------------------------------------------
   Render a grid of cards into a target container
--------------------------------------------------------- */
function renderGrid(containerId, cards, { addable }) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  if (cards.length === 0) {
    el.innerHTML = `<p style="color:var(--paper-dim);grid-column:1/-1">没有找到卡片 · No cards found</p>`;
    return;
  }
  cards.forEach((card) => {
    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.innerHTML = `
      <span class="faction-dot ${card.faction}"></span>
      ${addable ? `<button class="tile-add-btn" title="Add to session">+</button>` : ""}
      <img src="${card.image_url}" alt="${card.name}" loading="lazy" />
      <div class="tile-name">${card.name}</div>
    `;
    tile.querySelector("img").addEventListener("click", () => openModal(card));
    tile.querySelector(".tile-name").addEventListener("click", () => openModal(card));
    if (addable) {
      tile.querySelector(".tile-add-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        addToSession(card);
      });
    }
    el.appendChild(tile);
  });
}

/* ---------------------------------------------------------
   Search + faction filter (shared logic for browse & log pickers)
--------------------------------------------------------- */
function wireFilterControls({ searchInputId, filterContainerId, gridId, addable }) {
  const searchInput = document.getElementById(searchInputId);
  const filterContainer = document.getElementById(filterContainerId);
  let activeFaction = "ALL";

  function apply() {
    const q = searchInput.value.trim();
    const filtered = allCards.filter((c) => {
      const factionOk = activeFaction === "ALL" || c.faction === activeFaction;
      const searchOk = !q || c.name.includes(q) || c.card_id.toLowerCase().includes(q.toLowerCase());
      return factionOk && searchOk;
    });
    renderGrid(gridId, filtered, { addable });
  }

  searchInput.addEventListener("input", apply);
  filterContainer.querySelectorAll(".faction-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filterContainer.querySelectorAll(".faction-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeFaction = chip.dataset.faction;
      apply();
    });
  });
}

wireFilterControls({
  searchInputId: "search-input",
  filterContainerId: "faction-filters",
  gridId: "card-grid",
  addable: false,
});
wireFilterControls({
  searchInputId: "log-search-input",
  filterContainerId: "log-faction-filters",
  gridId: "log-card-grid",
  addable: true,
});

/* ---------------------------------------------------------
   Modal (full-res card view)
--------------------------------------------------------- */
const modal = document.getElementById("modal");
let currentModalCardId = null;

function openModal(card) {
  document.getElementById("modal-img").src = card.image_url;
  document.getElementById("modal-img").alt = card.name;
  document.getElementById("modal-name").textContent = card.name;
  document.getElementById("modal-id").textContent = card.card_id;
  const badge = document.getElementById("modal-faction-badge");
  badge.textContent = FACTION_LABEL[card.faction] || card.faction;
  badge.className = `faction-badge ${card.faction}`;
  modal.classList.remove("hidden");

  currentModalCardId = card.card_id;
  loadRatingCounts(card.card_id);
}
document.getElementById("modal-close").addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

/* ---------------------------------------------------------
   Ratings ("超模" / "夯" / "一般" / "拉") — one row per vote,
   counts are tallied client-side per card.
--------------------------------------------------------- */
async function loadRatingCounts(cardId) {
  const counts = { "超模": 0, "夯": 0, "一般": 0, "拉": 0 };
  const { data, error } = await supabase
    .from("card_ratings")
    .select("rating")
    .eq("card_id", cardId);

  if (!error && data) {
    data.forEach((row) => {
      if (counts[row.rating] !== undefined) counts[row.rating]++;
    });
  }
  RATING_OPTIONS.forEach((label) => {
    const span = document.querySelector(`[data-rating-count="${label}"]`);
    if (span) span.textContent = counts[label];
  });
}

document.querySelectorAll(".rating-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!currentModalCardId) return;
    const rating = btn.dataset.rating;
    btn.disabled = true;
    const { error } = await supabase
      .from("card_ratings")
      .insert({ card_id: currentModalCardId, rating });
    btn.disabled = false;
    if (error) {
      console.error(error);
      return;
    }
    loadRatingCounts(currentModalCardId);
  });
});

/* ---------------------------------------------------------
   Session (game log) building
--------------------------------------------------------- */
function addToSession(card) {
  if (currentSession.find((c) => c.card_id === card.card_id)) return;
  currentSession.push(card);
  renderSession();
}
function removeFromSession(cardId) {
  currentSession = currentSession.filter((c) => c.card_id !== cardId);
  renderSession();
}
function renderSession() {
  const el = document.getElementById("session-cards");
  el.innerHTML = "";
  currentSession.forEach((card) => {
    const chip = document.createElement("span");
    chip.className = "session-chip";
    chip.innerHTML = `${card.name} <button title="remove">&times;</button>`;
    chip.querySelector("button").addEventListener("click", () => removeFromSession(card.card_id));
    el.appendChild(chip);
  });
  document.getElementById("session-card-count").textContent = `(${currentSession.length})`;
}

document.getElementById("save-session-btn").addEventListener("click", async () => {
  const statusEl = document.getElementById("save-status");
  if (currentSession.length === 0) {
    statusEl.textContent = "请先添加卡片 · Add at least one card first.";
    return;
  }
  statusEl.textContent = "保存中... saving...";

  const notes = document.getElementById("session-notes").value.trim();

  const { data: session, error: sessionError } = await supabase
    .from("game_sessions")
    .insert({ notes })
    .select()
    .single();

  if (sessionError) {
    statusEl.textContent = `Failed: ${sessionError.message}`;
    return;
  }

  const rows = currentSession.map((c) => ({ session_id: session.id, card_id: c.card_id }));
  const { error: linkError } = await supabase.from("session_cards").insert(rows);

  if (linkError) {
    statusEl.textContent = `Failed: ${linkError.message}`;
    return;
  }

  statusEl.textContent = "已保存 · Saved!";
  currentSession = [];
  renderSession();
  document.getElementById("session-notes").value = "";
  loadSessionHistory();
});

/* ---------------------------------------------------------
   Session history
--------------------------------------------------------- */
async function loadSessionHistory() {
  const { data: sessions, error } = await supabase
    .from("game_sessions")
    .select("id, played_at, notes, session_cards(card_id)")
    .order("played_at", { ascending: false })
    .limit(20);

  const el = document.getElementById("session-history");
  if (error) {
    el.innerHTML = `<p style="color:#d17b7b">${error.message}</p>`;
    return;
  }
  if (!sessions || sessions.length === 0) {
    el.innerHTML = `<p style="color:var(--paper-dim)">还没有记录 · No sessions logged yet.</p>`;
    return;
  }
  el.innerHTML = "";
  sessions.forEach((s) => {
    const names = (s.session_cards || [])
      .map((sc) => allCards.find((c) => c.card_id === sc.card_id)?.name || sc.card_id)
      .join(" · ");
    const div = document.createElement("div");
    div.className = "session-history-item";
    const date = new Date(s.played_at).toLocaleString();
    div.innerHTML = `<span class="shi-date">${date}</span><br/>${names}${s.notes ? `<br/><em>${s.notes}</em>` : ""}`;
    el.appendChild(div);
  });
}

/* ---------------------------------------------------------
   Upload: filename parsing + drag & drop
--------------------------------------------------------- */
// Filenames vary in length (some have an extra descriptive segment before
// the name), but the actual card NAME is always the last dot-separated
// segment before the file extension. Faction/id, if present anywhere as a
// FACTION### segment, is used as a starting guess — you can always correct
// it afterward in Supabase's Table Editor, so this doesn't need to be exact.
function parseFilename(filename) {
  const dotIdx = filename.lastIndexOf(".");
  const stem = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  const segments = stem.split(".");

  const name = segments[segments.length - 1] || stem;

  let faction = "OTHER";
  let cardId = null;
  for (const seg of segments) {
    const m = seg.match(/^(WEI|SHU|WU|QUN)(\d+)$/);
    if (m) {
      faction = m[1];
      cardId = `${m[1]}${m[2]}`;
      break;
    }
  }
  if (!cardId) {
    const idSafe = stem.replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, "_");
    cardId = `OTHER_${idSafe}`;
  }

  return { faction, cardId, nickname: "", name };
}

function logUpload(message, cls) {
  const el = document.getElementById("upload-log");
  const line = document.createElement("div");
  line.className = cls;
  line.textContent = message;
  el.prepend(line);
}

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  for (const file of files) {
    const parsed = parseFilename(file.name);
    const ext = file.name.slice(file.name.lastIndexOf("."));
    const storagePath = `${parsed.faction}/${parsed.cardId}${ext}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

      const { error: dbError } = await supabase.from("cards").upsert(
        {
          faction: parsed.faction,
          card_id: parsed.cardId,
          name: parsed.name,
          nickname: parsed.nickname,
          image_url: urlData.publicUrl,
        },
        { onConflict: "card_id" }
      );
      if (dbError) throw dbError;

      const tag = parsed.faction === "OTHER" ? " (no faction detected — set it manually in Supabase)" : "";
      logUpload(`OK    ${parsed.cardId}  ${parsed.name}${tag}`, parsed.faction === "OTHER" ? "skip" : "ok");
    } catch (err) {
      logUpload(`FAIL  ${file.name}  (${err.message})`, "fail");
    }
  }
  loadCards();
}

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");

fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
  })
);
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */
loadCards();
loadSessionHistory();
