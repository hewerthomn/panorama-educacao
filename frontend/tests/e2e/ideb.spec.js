import { test, expect } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { manifest as censusManifest, geo } from "../fixtures/longitudinal.js";
const years = [2021, 2023, 2025];
const stages = {
  anos_iniciais: "Ensino fundamental — anos iniciais",
  anos_finais: "Ensino fundamental — anos finais",
  ensino_medio: "Ensino médio",
};
const cities = [
  { id: "1100015", name: "Município A" },
  { id: "1100023", name: "Município B" },
  { id: "1100031", name: "Município sem nota" },
];
function records(uf, stage, level) {
  const rows = [];
  for (const [i, year] of years.entries()) {
    const base = {
      year,
      uf,
      level,
      stage,
      network: level === "school" ? "Estadual" : "Pública",
      status: "available",
      school_id: null,
    };
    if (level === "state")
      rows.push({
        ...base,
        name: "Rondônia",
        municipality_id: null,
        ideb: [5.3, 5.5, 5.9][i],
      });
    else
      for (const [j, city] of cities.entries()) {
        const ideb =
          j === 2
            ? null
            : (stage === "anos_iniciais" ? [5, 5.4, 6][i] : [4, 4.3, 4.8][i]) +
              j * 0.1;
        rows.push({
          ...base,
          municipality_id: city.id,
          municipality_name: city.name,
          name: level === "school" ? `Escola ${j + 1}` : city.name,
          school_id: level === "school" ? `1100000${j + 1}` : null,
          ideb,
          status: ideb === null ? "not_published" : "available",
        });
      }
  }
  return rows;
}
async function setup(
  page,
  context,
  { fail = false, delay = false, noCensus = false } = {},
) {
  const requested = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/data/index.json", (route) =>
    route.fulfill({
      json: {
        states: noCensus
          ? []
          : [
              { uf: "RO", name: "Rondônia" },
              { uf: "AC", name: "Acre" },
            ],
      },
    }),
  );
  await context.route("**/data/*/manifest.json", (route) =>
    route.fulfill({ json: censusManifest }),
  );
  await context.route("**/data/*/municipios.geojson", (route) =>
    route.fulfill({ json: geo }),
  );
  await context.route("**/data/*/schools/*.json", (route) =>
    route.fulfill({
      json: {
        year: Number(
          route
            .request()
            .url()
            .match(/(\d+)\.json/)[1],
        ),
        schools: [{ id: "11000001", name: "Escola no Censo" }],
      },
    }),
  );
  await context.route("**/data/ideb/index.json", (route) =>
    route.fulfill({
      json: {
        schema_version: 1,
        states: [
          { uf: "RO", name: "Rondônia" },
          { uf: "AC", name: "Acre" },
        ],
      },
    }),
  );
  await context.route("**/data/ideb/*/manifest.json", (route) => {
    const uf = route.request().url().includes("/AC/") ? "AC" : "RO";
    return route.fulfill({
      json: {
        schema_version: 1,
        uf,
        state_name: uf === "RO" ? "Rondônia" : "Acre",
        years,
        stages,
        municipalities: cities,
        generated_at: "2026-10-19",
        source_page: "https://www.gov.br/inep",
        sources: {},
        files: Object.fromEntries(
          Object.keys(stages).map((stage) => [
            stage,
            Object.fromEntries(
              ["state", "municipality", "school"].map((level) => [
                level,
                { path: `${stage}_${level}.json` },
              ]),
            ),
          ]),
        ),
      },
    });
  });
  await context.route("**/data/ideb/*/*.json", async (route) => {
    const url = route.request().url();
    if (url.endsWith("manifest.json")) return route.fallback();
    const match = url.match(
      /ideb\/(\w+)\/(anos_iniciais|anos_finais|ensino_medio)_(state|municipality|school).json/,
    );
    if (!match) return route.fallback();
    const [, uf, stage, level] = match;
    requested.push(`${uf}/${stage}/${level}`);
    if (delay && uf === "RO")
      await new Promise((resolve) => setTimeout(resolve, 350));
    if (fail && level === "school") {
      fail = false;
      return route.fulfill({ status: 503, body: "unavailable" });
    }
    return route.fulfill({
      json: {
        schema_version: 1,
        uf,
        stage,
        level,
        records: records(uf, stage, level),
      },
    });
  });
  await context.route("**/*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/tests/e2e/fixtures/dashboard.html?uf=RO");
  await page
    .getByRole("button", { name: "Desempenho educacional", exact: true })
    .click();
  return { requested, errors };
}
async function filters(page, isMobile, action) {
  if (isMobile)
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await action();
  if (isMobile)
    await page
      .getByRole("button", { name: "Fechar filtros", exact: true })
      .click();
}
test("Ideb oficial independente: mapa fixo, filtros, histórico escolar, ranking, animação e mobile", async ({
  page,
  context,
  isMobile,
}, info) => {
  const { errors, requested } = await setup(page, context);
  await expect(page).toHaveTitle("Panorama da Educação");
  await expect(page.locator(".ideb-analysis .kpi strong")).toHaveText([
    "5,9",
    "+0,4 pontos",
    "+0,6 pontos",
    "2 / 3",
  ]);
  await expect(page.locator(".map-legend")).toContainText(
    "Ideb · nota de 0 a 10",
  );
  await expect(page.locator(".legend-values")).toHaveText("02,557,510");
  expect(await page.evaluate(() => window.chartSnapshots()[0].max)).toBe(10);
  expect(await page.evaluate(() => window.chartSnapshots()[0].min)).toBe(0);
  expect(
    await page.evaluate(
      () => window.mapLayer.getLayers().at(-1).options.fillColor,
    ),
  ).toBe("#92999f");
  await expect(page.locator(".ideb-ranking tbody tr")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Ordenar resultados", exact: true })
    .selectOption("lowest");
  await expect(page.locator(".ideb-ranking tbody tr").first()).toContainText(
    "Município A",
  );
  await page
    .getByRole("searchbox", { name: "Pesquisar escola ou código Inep" })
    .fill("11000001");
  await expect(page.locator(".ideb-schools tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Escola 1", exact: true }).click();
  await expect(page.locator(".ideb-school-history tbody tr")).toHaveCount(3);
  await expect(page.locator(".ideb-school-history")).toContainText("11000001");
  await page
    .getByRole("button", { name: "Relacionar ao Censo de 2025", exact: true })
    .click();
  await expect(page.locator(".ideb-census")).toContainText(
    "Escola localizada no Censo de 2025: Escola no Censo.",
  );
  await page.evaluate(() => window.mapLayer.getLayers()[0].fire("click"));
  await expect(
    page.locator('[aria-label="Município selecionado"]'),
  ).toContainText("Município A");
  await expect(page.locator(".ideb-analysis .kpi strong").first()).toHaveText(
    "6,0",
  );
  await filters(page, isMobile, async () => {
    await expect(page.getByLabel("Localização", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page
        .getByRole("combobox", { name: "Rede publicada", exact: true })
        .locator("option"),
    ).toHaveText(["Pública"]);
    await page
      .getByRole("combobox", { name: "Etapa de ensino", exact: true })
      .selectOption("anos_finais");
    await expect(
      page.getByRole("combobox", { name: "Edição do Ideb", exact: true }),
    ).toBeEnabled();
  });
  await expect(page.locator(".ideb-analysis .kpi strong").first()).toHaveText(
    "4,8",
  );
  await page.locator("#ideb-slider").focus();
  await page.locator("#ideb-slider").press("Home");
  await expect(page.locator(".ideb-analysis .kpi strong").first()).toHaveText(
    "4,0",
  );
  await page.getByRole("button", { name: "Reproduzir", exact: true }).click();
  await expect(page.locator("#ideb-slider")).toHaveValue("1", {
    timeout: 4000,
  });
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(tmpdir(), `panorama-ideb-${info.project.name}.png`),
    fullPage: true,
  });
  expect(requested.filter((s) => s === "RO/anos_iniciais/school")).toHaveLength(
    1,
  );
  expect(errors).toEqual([]);
  await page
    .getByRole("button", { name: "Panorama por ano", exact: true })
    .click();
  await expect(page.locator("#year-slider")).toBeVisible();
});
test("erros assíncronos permitem retry sem mostrar resultados antigos", async ({
  page,
  context,
}) => {
  const { errors } = await setup(page, context, { fail: true });
  await expect(page.locator('.ideb-analysis [role="alert"]')).toContainText(
    "503",
  );
  await page
    .locator(".ideb-analysis")
    .getByRole("button", { name: "Tentar novamente" })
    .click();
  await expect(page.locator(".ideb-analysis .kpi strong").first()).toHaveText(
    "5,9",
  );
  expect(errors).toEqual([]);
});
test("troca de UF durante carregamento e funcionamento sem dados do Censo", async ({
  page,
  context,
  isMobile,
}) => {
  const { errors } = await setup(page, context, {
    delay: true,
    noCensus: true,
  });
  await filters(page, isMobile, async () => {
    await page
      .getByRole("combobox", { name: "Estado", exact: true })
      .fill("Acre");
    await page.getByRole("option", { name: "Acre (AC)", exact: true }).click();
  });
  await expect(page.locator(".ideb-heading")).toContainText("Acre");
  await expect(page.locator(".ideb-analysis .kpi strong").first()).toHaveText(
    "5,9",
  );
  expect(errors).toEqual([]);
});
