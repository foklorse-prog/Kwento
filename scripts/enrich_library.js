const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const LIB_PATH = path.join(ROOT, "data", "library.json");
const CAND_PATH = path.join(ROOT, "data", "candidates.txt");
const API_KEY = process.env.OMDB_API_KEY;

if (!API_KEY) {
  throw new Error("Missing OMDB_API_KEY secret");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function readCandidates(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeCandidates(file, titles) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, titles.join("\n") + (titles.length ? "\n" : ""), "utf8");
}

function normType(t) {
  const x = String(t || "").toLowerCase();
  if (x === "movie" || x === "series") return x;
  return "";
}

function normTitle(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/\(\d{4}\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function isListLikeTitle(title) {
  const t = String(title || "").toLowerCase();
  return /\b(list of|best of|top \d+|countdown|nominees|winners|awards|shortlist|finalists|selection|showcase)\b/.test(t);
}

function buildTags(d) {
  const tags = [];
  const genre = String(d.Genre || "").toLowerCase();
  if (genre.includes("drama")) tags.push("dramatic", "emotional");
  if (genre.includes("romance")) tags.push("romantic");
  if (genre.includes("thriller")) tags.push("intense", "suspenseful");
  if (genre.includes("horror")) tags.push("dark");
  if (genre.includes("comedy")) tags.push("fun", "lighthearted");
  if (genre.includes("action")) tags.push("action");
  if (genre.includes("animation")) tags.push("animated");
  if (genre.includes("crime")) tags.push("crime");
  if (genre.includes("mystery")) tags.push("mysterious");
  if (genre.includes("sci-fi") || genre.includes("science fiction")) tags.push("sci-fi");
  if (genre.includes("fantasy")) tags.push("fantasy");
  return [...new Set(tags)];
}

async function omdbByTitle(title) {
  const url = `https://www.omdbapi.com/?apikey=${API_KEY}&t=${encodeURIComponent(title)}&plot=short`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = await res.json();
  if (d.Response === "False") return null;

  const omdbType = normType(d.Type);
  if (!omdbType) return null;
  if (isListLikeTitle(d.Title)) return null;

  const genres = d.Genre && d.Genre !== "N/A"
    ? d.Genre.split(",").map((g) => g.trim()).filter(Boolean)
    : [];
  const actors = d.Actors && d.Actors !== "N/A"
    ? d.Actors.split(",").map((a) => a.trim()).filter(Boolean)
    : [];

  const imdbRating = d.imdbRating && d.imdbRating !== "N/A" ? parseFloat(d.imdbRating) : null;
  const imdbVotes = d.imdbVotes && d.imdbVotes !== "N/A" ? parseInt(d.imdbVotes.replace(/,/g, ""), 10) : null;
  const country = d.Country && d.Country !== "N/A" ? d.Country : null;
  const ph = country ? country.toLowerCase().includes("philippines") : false;

  if (imdbRating != null && imdbRating < 6.0) return null;
  if (!ph && imdbVotes != null && imdbVotes < 1000) return null;

  return {
    title: d.Title || title,
    year: d.Year ? d.Year.slice(0, 4) : null,
    genre: genres[0] || null,
    genres,
    director: d.Director && d.Director !== "N/A" ? d.Director : null,
    actor: actors[0] || null,
    actors,
    plot: d.Plot && d.Plot !== "N/A" ? d.Plot : null,
    poster: d.Poster && d.Poster !== "N/A" ? d.Poster : null,
    posterId: d.imdbID || null,
    imdbID: d.imdbID || null,
    imdbRating,
    imdbVotes,
    runtime: d.Runtime && d.Runtime !== "N/A" ? d.Runtime : null,
    rated: d.Rated && d.Rated !== "N/A" ? d.Rated : null,
    country,
    language: d.Language && d.Language !== "N/A" ? d.Language : null,
    awards: d.Awards && d.Awards !== "N/A" ? d.Awards : null,
    omdbType,
    tags: buildTags(d),
    ph,
    source: "auto_candidates",
    _fromOmdb: true
  };
}

(async () => {
  const lib = readJson(LIB_PATH, { version: 1, updatedAt: null, items: [] });
  const items = Array.isArray(lib.items) ? lib.items : [];

  const byId = new Set(items.map((m) => String(m.imdbID || "").toLowerCase()).filter(Boolean));
  const byTitle = new Set(items.map((m) => normTitle(m.title)).filter(Boolean));

  const candidates = readCandidates(CAND_PATH);
  if (!candidates.length) {
    console.log("No candidates.");
    return;
  }

  const remaining = [];
  let added = 0;

  for (const title of candidates) {
    try {
      const meta = await omdbByTitle(title);
      if (!meta) {
        remaining.push(title);
        continue;
      }

      const idKey = String(meta.imdbID || "").toLowerCase();
      const titleKey = normTitle(meta.title);

      if ((idKey && byId.has(idKey)) || byTitle.has(titleKey)) {
        continue;
      }

      items.push(meta);
      if (idKey) byId.add(idKey);
      byTitle.add(titleKey);
      added++;
    } catch {
      remaining.push(title);
    }
  }

  lib.version = lib.version || 1;
  lib.updatedAt = new Date().toISOString();
  lib.items = items;

  writeJson(LIB_PATH, lib);
  writeCandidates(CAND_PATH, remaining);

  console.log(`Added: ${added}`);
  console.log(`Remaining candidates: ${remaining.length}`);
})();
