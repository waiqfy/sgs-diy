import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BUCKET_NAME } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const FACTION_LABEL = { WEI: "魏", SHU: "蜀", WU: "吴", QUN: "群", OTHER: "其他" };
const RATING_OPTIONS = ["超模", "夯", "一般", "拉"];
const PLAYER_COUNT = 8;
const SLOTS_PER_PLAYER = 3;

let allCards = [];   // full list from DB
// session[playerIndex][slotIndex] = card object | null
let session = Array.from({ length: PLAYER_COUNT }, () => Array(SLOTS_PER_PLAYER).fill(null));

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
  renderGrid("card-grid", allCards, { pickable: false });
  updateCardCount();
}

function updateCardCount() {
  document.getElementById("card-count").textContent = `${allCards.length} 张卡`;
}

/* ---------------------------------------------------------
   Render a grid of cards into a target container.
   pickable=true is used inside the picker modal, where clicking
   a card fills the currently-targeted player slot.
--------------------------------------------------------- */
function renderGrid(containerId, cards, { pickable }) {
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
      <img src="${card.image_url}" alt="${card.name}" loading="lazy" />
      <div class="tile-name">${card.name}</div>
    `;
    if (pickable) {
      tile.addEventListener("click", () => choosePickedCard(card));
    } else {
      tile.addEventListener("click", () => openModal(card));
    }
    el.appendChild(tile);
  });
}

/* ---------------------------------------------------------
   Browse: search + faction filter
--------------------------------------------------------- */
function wireFilterControls({ searchInputId, filterContainerId, gridId, pickable }) {
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
    renderGrid(gridId, filtered, { pickable });
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
  pickable: false,
});

/* ---------------------------------------------------------
   Modal (full-res card view + ratings)
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
    const { error } = await supabase.from("card_ratings").insert({ card_id: currentModalCardId, rating });
    btn.disabled = false;
    if (error) { console.error(error); return; }
    loadRatingCounts(currentModalCardId);
  });
});

/* ---------------------------------------------------------
   Log page: 8 players x 3 card slots
--------------------------------------------------------- */
const playersGrid = document.getElementById("players-grid");

function renderPlayers() {
  playersGrid.innerHTML = "";
  for (let p = 0; p < PLAYER_COUNT; p++) {
    const panel = document.createElement("div");
    panel.className = "player-panel";
    panel.innerHTML = `<p class="player-label">玩家 ${p + 1}</p>
      <div class="player-slots" data-player="${p}"></div>`;
    const slotsEl = panel.querySelector(".player-slots");

    for (let s = 0; s < SLOTS_PER_PLAYER; s++) {
      const card = session[p][s];
      const block = document.createElement("div");
      block.className = "slot-block";
      if (card) {
        block.innerHTML = `
          <button class="slot-remove" title="remove">&times;</button>
          <img src="${card.image_url}" alt="${card.name}" />
          <span class="slot-name">${card.name}</span>
        `;
        block.querySelector(".slot-remove").addEventListener("click", (e) => {
          e.stopPropagation();
          session[p][s] = null;
          renderPlayers();
        });
        block.addEventListener("click", () => openPicker(p, s));
      } else {
        block.innerHTML = `<span class="slot-plus">+</span>`;
        block.addEventListener("click", () => openPicker(p, s));
      }
      slotsEl.appendChild(block);
    }
    playersGrid.appendChild(panel);
  }
}

/* ---------------------------------------------------------
   Picker modal: search by name, click a result to fill the
   currently targeted player+slot
--------------------------------------------------------- */
const pickerModal = document.getElementById("picker-modal");
const pickerSearch = document.getElementById("picker-search");
const pickerTitle = document.getElementById("picker-title");
let pickerTarget = null; // { player, slot }

function openPicker(player, slot) {
  pickerTarget = { player, slot };
  pickerTitle.textContent = `玩家 ${player + 1} · 位置 ${slot + 1} — 搜索武将名`;
  pickerSearch.value = "";
  renderGrid("picker-grid", allCards, { pickable: true });
  pickerModal.classList.remove("hidden");
  pickerSearch.focus();
}
function closePicker() {
  pickerModal.classList.add("hidden");
  pickerTarget = null;
}
function choosePickedCard(card) {
  if (!pickerTarget) return;
  session[pickerTarget.player][pickerTarget.slot] = card;
  renderPlayers();
  closePicker();
}
document.getElementById("picker-close").addEventListener("click", closePicker);
pickerModal.addEventListener("click", (e) => { if (e.target === pickerModal) closePicker(); });
pickerSearch.addEventListener("input", () => {
  const q = pickerSearch.value.trim();
  const filtered = !q
    ? allCards
    : allCards.filter((c) => c.name.includes(q) || c.card_id.toLowerCase().includes(q.toLowerCase()));
  renderGrid("picker-grid", filtered, { pickable: true });
});

/* ---------------------------------------------------------
   Save session
--------------------------------------------------------- */
document.getElementById("save-session-btn").addEventListener("click", async () => {
  const statusEl = document.getElementById("save-status");
  const rows = [];
  session.forEach((slots, playerIdx) => {
    slots.forEach((card, slotIdx) => {
      if (card) rows.push({ player: playerIdx + 1, slot: slotIdx + 1, card });
    });
  });

  if (rows.length === 0) {
    statusEl.textContent = "请先给至少一位玩家添加卡片 · Add at least one card first.";
    return;
  }
  statusEl.textContent = "保存中... saving...";

  const notes = document.getElementById("session-notes").value.trim();

  const { data: newSession, error: sessionError } = await supabase
    .from("game_sessions")
    .insert({ notes })
    .select()
    .single();

  if (sessionError) {
    statusEl.textContent = `Failed: ${sessionError.message}`;
    return;
  }

  const linkRows = rows.map((r) => ({
    session_id: newSession.id,
    card_id: r.card.card_id,
    player_number: r.player,
    slot_number: r.slot,
  }));
  const { error: linkError } = await supabase.from("session_cards").insert(linkRows);

  if (linkError) {
    statusEl.textContent = `Failed: ${linkError.message}`;
    return;
  }

  statusEl.textContent = "已保存 · Saved!";
  session = Array.from({ length: PLAYER_COUNT }, () => Array(SLOTS_PER_PLAYER).fill(null));
  renderPlayers();
  document.getElementById("session-notes").value = "";
  loadSessionHistory();
});

/* ---------------------------------------------------------
   Session history — grouped by player
--------------------------------------------------------- */
async function loadSessionHistory() {
  const { data: sessions, error } = await supabase
    .from("game_sessions")
    .select("id, played_at, notes, session_cards(card_id, player_number, slot_number)")
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
    const byPlayer = {};
    (s.session_cards || []).forEach((sc) => {
      const p = sc.player_number || "?";
      byPlayer[p] = byPlayer[p] || [];
      const name = allCards.find((c) => c.card_id === sc.card_id)?.name || sc.card_id;
      byPlayer[p].push(name);
    });
    const playerLines = Object.keys(byPlayer)
      .sort((a, b) => a - b)
      .map((p) => `玩家${p}: ${byPlayer[p].join("、")}`)
      .join(" &nbsp;|&nbsp; ");

    const div = document.createElement("div");
    div.className = "session-history-item";
    const date = new Date(s.played_at).toLocaleString();
    div.innerHTML = `<span class="shi-date">${date}</span><br/>${playerLines}${s.notes ? `<br/><em>${s.notes}</em>` : ""}`;
    el.appendChild(div);
  });
}

/* ---------------------------------------------------------
   Upload: choose a type first, then parse filenames + drag & drop
--------------------------------------------------------- */
// Filenames vary in length (some have an extra descriptive segment before
// the name), but the actual card NAME is always the last dot-separated
// segment before the file extension. The faction/type for the whole batch
// is whatever the person selects in the dropdown before uploading — it's
// no longer guessed from the filename, since that guess wasn't reliable.
function parseFilename(filename, chosenFaction) {
  const dotIdx = filename.lastIndexOf(".");
  const stem = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  const segments = stem.split(".");
  const name = segments[segments.length - 1] || stem;

  // Try to reuse an existing FACTION### id if present in the filename,
  // otherwise build one from the chosen faction + a sanitized filename.
  let cardId = null;
  for (const seg of segments) {
    const m = seg.match(/^([A-Za-z]+)(\d+)$/);
    if (m) { cardId = `${chosenFaction}${m[2]}`; break; }
  }
  if (!cardId) {
    const idSafe = stem.replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, "_");
    cardId = `${chosenFaction}_${idSafe}`;
  }

  return { faction: chosenFaction, cardId, nickname: "", name };
}

function logUpload(message, cls) {
  const el = document.getElementById("upload-log");
  const line = document.createElement("div");
  line.className = cls;
  line.textContent = message;
  el.prepend(line);
}

async function handleFiles(fileList, chosenFaction) {
  const files = Array.from(fileList);
  for (const file of files) {
    const parsed = parseFilename(file.name, chosenFaction);
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

      logUpload(`OK    ${parsed.cardId}  ${parsed.name}`, "ok");
    } catch (err) {
      logUpload(`FAIL  ${file.name}  (${err.message})`, "fail");
    }
  }
  loadCards();
}

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const typeSelect = document.getElementById("upload-type-select");

typeSelect.addEventListener("change", () => {
  const enabled = !!typeSelect.value;
  dropzone.classList.toggle("disabled", !enabled);
  fileInput.disabled = !enabled;
});

fileInput.addEventListener("change", (e) => {
  if (!typeSelect.value) return;
  handleFiles(e.target.files, typeSelect.value);
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    if (typeSelect.value) dropzone.classList.add("drag-over");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
  })
);
dropzone.addEventListener("drop", (e) => {
  if (!typeSelect.value) return;
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files, typeSelect.value);
});

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */
loadCards();
loadSessionHistory();
renderPlayers();
