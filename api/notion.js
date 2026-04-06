const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = "2022-06-28";

const DB_ENTRENOS = process.env.NOTION_DB_ENTRENOS;
const DB_MACROS   = process.env.NOTION_DB_MACROS;
const DB_DIARIO   = process.env.NOTION_DB_DIARIO;
const DB_PRS      = process.env.NOTION_DB_PRS;

const headers = {
  "Authorization": `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
};

async function notionRequest(path, method = "GET", body = null) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function queryDB(dbId) {
  const data = await notionRequest(`/databases/${dbId}/query`, "POST", {
    sorts: [{ property: "Fecha", direction: "descending" }],
    page_size: 100,
  });
  return data.results || [];
}

function prop(page, name) {
  const p = page.properties?.[name];
  if (!p) return null;
  switch (p.type) {
    case "title": return p.title?.[0]?.plain_text || null;
    case "rich_text": return p.rich_text?.[0]?.plain_text || null;
    case "number": return p.number;
    case "select": return p.select?.name || null;
    case "date": return p.date?.start || null;
    default: return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.query;

  try {
    // ── GET ALL DATA ──────────────────────────────────────
    if (req.method === "GET" && action === "all") {
      const [entrenos, macros, prs, diario] = await Promise.all([
        queryDB(DB_ENTRENOS),
        queryDB(DB_MACROS),
        queryDB(DB_PRS),
        queryDB(DB_DIARIO),
      ]);

      // Group entrenos by date
      const byDate = {};
      for (const page of entrenos) {
        const date = prop(page, "Fecha");
        const tipo = prop(page, "Tipo");
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { date, exercises: {} };

        const key = tipo === "Bench Press" ? "bench"
                  : tipo === "Dead Lift"   ? "deadlift"
                  : tipo === "Squats"      ? "squats"
                  : null;
        if (!key) continue;

        byDate[date].exercises[key] = {
          pr:      prop(page, "Peso Máximo (kg)"),
          notas:   prop(page, "Notas"),
          s1reps:  prop(page, "Serie 1 - Reps"),
          s1kg:    prop(page, "Serie 1 - Peso (kg)"),
          s2reps:  prop(page, "Serie 2 - Reps"),
          s2kg:    prop(page, "Serie 2 - Peso (kg)"),
          s3reps:  prop(page, "Serie 3 - Reps"),
          s3kg:    prop(page, "Serie 3 - Peso (kg)"),
          s4reps:  prop(page, "Serie 4 - Reps"),
          s4kg:    prop(page, "Serie 4 - Peso (kg)"),
        };
      }

      // Merge diario into byDate
      for (const page of diario) {
        const date = prop(page, "Fecha");
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { date, exercises: {} };
        byDate[date].mood   = prop(page, "Estado de Ánimo");
        byDate[date].sleep  = prop(page, "Horas de Sueño");
        byDate[date].meals  = prop(page, "Comidas");
        byDate[date].notes  = prop(page, "Notas del Día");
        byDate[date].stress = prop(page, "Estrés Laboral");
      }

      // Merge macros into byDate
      for (const page of macros) {
        const date = prop(page, "Fecha");
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { date, exercises: {} };
        byDate[date].macros = {
          cals:    prop(page, "Calorías (kcal)"),
          protein: prop(page, "Proteína (g)"),
          carbs:   prop(page, "Carbohidratos (g)"),
          fat:     prop(page, "Grasas (g)"),
          water:   prop(page, "Agua (L)"),
          weight:  prop(page, "Peso Corporal (kg)"),
          bodyfat: prop(page, "% Grasa Corporal"),
        };
        // Also attach weight/bf to main record
        byDate[date].weight  = prop(page, "Peso Corporal (kg)");
        byDate[date].bodyfat = prop(page, "% Grasa Corporal");
      }

      // PRs
      const prMap = {};
      for (const page of prs) {
        const name = prop(page, "Ejercicio");
        const key = name === "Bench Press" ? "bench"
                  : name === "Dead Lift"   ? "deadlift"
                  : name === "Squats"      ? "squats"
                  : null;
        if (key) prMap[key] = { kg: prop(page, "PR Peso (kg)"), reps: prop(page, "PR Reps"), date: prop(page, "Fecha del PR") };
      }

      const logs = Object.values(byDate).sort((a,b) => b.date.localeCompare(a.date));
      return res.json({ logs, prs: prMap });
    }

    // ── SAVE MACROS ───────────────────────────────────────
    if (req.method === "POST" && action === "macros") {
      const { date, cals, protein, carbs, fat, water, weight, bodyfat, notes } = req.body;
      const dateStr = date.split("T")[0];
      const dd = dateStr.slice(8,10);
      const mm = dateStr.slice(5,7);

      await notionRequest("/pages", "POST", {
        parent: { database_id: DB_MACROS },
        properties: {
          "Día": { title: [{ text: { content: `${dd}.${mm}` } }] },
          "Fecha": { date: { start: dateStr } },
          ...(cals    != null && { "Calorías (kcal)":   { number: cals } }),
          ...(protein != null && { "Proteína (g)":       { number: protein } }),
          ...(carbs   != null && { "Carbohidratos (g)":  { number: carbs } }),
          ...(fat     != null && { "Grasas (g)":         { number: fat } }),
          ...(water   != null && { "Agua (L)":           { number: water } }),
          ...(weight  != null && { "Peso Corporal (kg)": { number: weight } }),
          ...(bodyfat != null && { "% Grasa Corporal":   { number: bodyfat } }),
          ...(notes   && { "Notas": { rich_text: [{ text: { content: notes } }] } }),
        },
      });
      return res.json({ ok: true });
    }

    return res.status(404).json({ error: "Unknown action" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
