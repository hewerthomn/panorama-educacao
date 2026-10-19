import { test, expect } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { manifest, geo, annual, school } from "../fixtures/longitudinal.js";

async function setup(page, context, options = {}) {
  const requested = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/data/index.json", (route) =>
    route.fulfill({
      json: {
        states: [
          { uf: "RO", name: "Rondônia" },
          { uf: "AC", name: "Acre" },
        ],
      },
    }),
  );
  await context.route("**/data/*/manifest.json", (route) => {
    const uf = route.request().url().includes("/AC/") ? "AC" : "RO";
    return route.fulfill({
      json: {
        ...(options.manifest || manifest),
        uf,
        state_name: uf === "AC" ? "Acre" : "Rondônia",
      },
    });
  });
  await context.route("**/data/*/municipios.geojson", (route) =>
    route.fulfill({ json: geo }),
  );
  await context.route("**/data/*/schools/*.json", async (route) => {
    const url = route.request().url();
    const year = Number(url.match(/(\d+)\.json/)[1]);
    const uf = url.includes("/AC/") ? "AC" : "RO";
    requested.push(`${uf}/${year}`);
    if (options.respond && (await options.respond(route, uf, year))) return;
    await route.fulfill({ json: { uf, year, schools: annual.get(year) } });
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
  await expect(page).toHaveTitle("Panorama da Educação");
  await expect(page.locator("h1")).toHaveText("Panorama da Educação");
  await page
    .getByRole("button", { name: "Evolução das escolas", exact: true })
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
async function choose(page, name, query, option) {
  await page.getByRole("combobox", { name, exact: true }).fill(query);
  await page.getByRole("option", { name: option, exact: true }).click();
}
const summary = (page) => page.locator(".evolution-summary");

test("mesmas escolas, transições, mapa, ranking, lista e histórico; cache por ano", async ({
  page,
  context,
  isMobile,
}, info) => {
  const { requested, errors } = await setup(page, context);
  await expect(summary(page)).toContainText("4 escolas comparáveis");
  await expect(page.locator(".evolution-kpis .kpi strong")).toHaveText([
    "1",
    "1",
    "1",
    "1",
    "2",
  ]);
  await expect(page.locator(".evolution-summary > div strong")).toHaveText(
    "0,0 p.p.",
  );
  await expect(page.locator(".coverage-note")).toContainText(
    "Saiu da base de escolas ativas: 1",
  );
  expect(requested.sort()).toEqual(["RO/2020", "RO/2025"]);
  await expect(page.locator(".map-legend strong")).toHaveText(
    "Saldo de evolução das escolas",
  );
  await expect(page.locator(".legend-values")).toHaveText("−100−500+50+100");
  expect(
    await page.evaluate(() =>
      window.mapLayer.getLayers().map((layer) => layer.options.fillColor),
    ),
  ).toEqual(["#edf0ed", "#edf0ed", "#92999f"]);
  const bar = await page.evaluate(() =>
    window.chartSnapshots().find((chart) => chart.type === "bar"),
  );
  expect(bar.datasets[0].data).toEqual([1, 1, 1, 1]);
  const ranking = page
    .getByRole("heading", { name: "Ranking longitudinal" })
    .locator("xpath=ancestor::section[1]");
  await page
    .getByRole("combobox", { name: "Ordenar por", exact: true })
    .selectOption("worsening");
  await expect(ranking.locator("tbody tr").first()).toContainText(
    "Município A",
  );
  await expect(ranking.locator("tbody tr").first()).toContainText("33,3%");
  const schoolList = page
    .getByRole("heading", { name: "Escolas da comparação", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(schoolList.locator("tbody tr")).toHaveCount(8);
  await page
    .getByRole("searchbox", { name: "Pesquisar escola ou código Inep" })
    .fill("novo nome");
  await expect(schoolList.locator("tbody tr")).toHaveCount(1);
  await expect(
    schoolList.locator("tbody tr").filter({ hasText: "Novo nome" }),
  ).toContainText("nome anterior: Escola 1");
  await schoolList
    .getByRole("button", { name: "Novo nome", exact: true })
    .click();
  await expect(page.locator(".school-history-timeline li")).toHaveCount(3);
  await expect(page.locator(".school-history-timeline li")).toHaveText([
    /2020Não possuía o recursoEscola 1/,
    /2022Resposta indisponívelEscola 1/,
    /2025Possuía o recursoNovo nome/,
  ]);
  expect(requested.filter((key) => key === "RO/2020")).toHaveLength(1);
  expect(requested.filter((key) => key === "RO/2025")).toHaveLength(1);
  expect(requested.filter((key) => key === "RO/2022")).toHaveLength(1);
  if (!isMobile) await page.setViewportSize({ width: 1536, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(tmpdir(), `panorama-longitudinal-${info.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Panorama por ano" }).click();
  await expect(page.locator("#year-slider")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Evolução histórica", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("filtros iniciais, períodos disponíveis, ausência de comparáveis e município clicado", async ({
  page,
  context,
  isMobile,
}) => {
  const { errors } = await setup(page, context);
  await expect(summary(page)).toContainText("4 escolas comparáveis");
  await page
    .getByRole("combobox", { name: "De:", exact: true })
    .selectOption("2022");
  await expect(summary(page)).toContainText("1 escolas comparáveis");
  await expect(
    page.getByRole("combobox", { name: "Até:", exact: true }).locator("option"),
  ).toHaveText(["2025"]);
  await page
    .getByRole("combobox", { name: "De:", exact: true })
    .selectOption("2020");
  await expect(summary(page)).toContainText("4 escolas comparáveis");
  await page
    .getByRole("combobox", { name: "Até:", exact: true })
    .selectOption("2022");
  await expect(page.locator(".evolution-summary > div strong")).toHaveText(
    "+100,0 p.p.",
  );
  await page
    .getByRole("combobox", { name: "Até:", exact: true })
    .selectOption("2025");
  await expect(summary(page)).toContainText("4 escolas comparáveis");
  await filters(page, isMobile, async () => {
    await choose(page, "Município", "A", "Município A");
    await page
      .getByRole("combobox", { name: "Rede de ensino", exact: true })
      .selectOption("3");
    await page
      .getByRole("combobox", { name: "Localização", exact: true })
      .selectOption("1");
  });
  await expect(summary(page)).toContainText("3 escolas comparáveis");
  await expect(page.locator(".evolution-kpis .kpi strong").first()).toHaveText(
    "1",
  );
  await expect(page.locator(".municipal-comparison")).toContainText(
    "1 melhoraram",
  );
  await page.getByRole("button", { name: "Ver escolas da comparação" }).click();
  await expect(
    page.getByRole("button", { name: "Novo nome", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Transição", exact: true })
    .selectOption("improved");
  await expect(page.locator(".schools-table tbody tr")).toHaveCount(1);
  await filters(page, isMobile, async () => {
    await page.getByRole("button", { name: "Redefinir recorte" }).click();
    await choose(page, "Município", "C", "Município C");
  });
  await expect(summary(page)).toContainText("0 escolas comparáveis");
  await expect(page.locator(".evolution-summary > div strong")).toHaveText(
    "N/D",
  );
  await expect(page.locator(".evolution-kpis .kpi strong").last()).toHaveText(
    "1",
  );
  expect(
    await page.evaluate(() =>
      window.mapLayer
        .getLayers()
        .every((layer) => layer.options.fillColor === "#92999f"),
    ),
  ).toBe(true);
  await filters(page, isMobile, () =>
    page.getByRole("button", { name: "Redefinir recorte" }).click(),
  );
  await expect(summary(page)).toContainText("4 escolas comparáveis");
  // Mesmo evento de clique Leaflet usado pelos polígonos reais.
  await page.evaluate(() => window.mapLayer.getLayers()[1].fire("click"));
  await expect(page.locator(".municipal-comparison")).toContainText(
    "Município B",
  );
  await expect(summary(page)).toContainText("1 escolas comparáveis");
  expect(errors).toEqual([]);
});

test("trocas rápidas de período e indicador não exibem resultados obsoletos", async ({
  page,
  context,
  isMobile,
}) => {
  const { errors } = await setup(page, context, {
    respond: async (route, uf, year) => {
      if (year !== 2022) return false;
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ json: { uf, year, schools: annual.get(year) } });
      return true;
    },
  });
  await expect(summary(page)).toContainText("4 escolas comparáveis");
  await page
    .getByRole("combobox", { name: "De:", exact: true })
    .selectOption("2022");
  await expect(summary(page)).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "De:", exact: true })
    .selectOption("2020");
  await filters(page, isMobile, () =>
    choose(page, "Indicador", "internet", "Acesso à internet"),
  );
  await expect(summary(page)).toContainText("6 escolas comparáveis");
  await expect(page.locator(".evolution-kpis .kpi strong")).toHaveText([
    "0",
    "0",
    "6",
    "0",
    "0",
  ]);
  await page
    .getByRole("combobox", { name: "De:", exact: true })
    .selectOption("2022");
  await expect(summary(page)).toContainText("2 escolas comparáveis");
  await expect(page.locator(".evolution-kpis .kpi strong")).toHaveText([
    "0",
    "0",
    "2",
    "0",
    "0",
  ]);
  expect(errors).toEqual([]);
});

test("troca de UF encerra cargas antigas e usa somente os dados do novo estado", async ({
  page,
  context,
  isMobile,
}) => {
  const { errors } = await setup(page, context, {
    respond: async (route, uf, year) => {
      if (uf === "RO") await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        json: {
          uf,
          year,
          schools:
            uf === "AC"
              ? [school("99", year === 2020 ? 1 : 0)]
              : annual.get(year),
        },
      });
      return true;
    },
  });
  await filters(page, isMobile, () =>
    choose(page, "Estado", "Acre", "Acre (AC)"),
  );
  await expect(page.locator(".territory")).toContainText("Acre");
  await expect(summary(page)).toContainText("1 escolas comparáveis");
  await expect(page.locator(".evolution-summary > div strong")).toHaveText(
    "-100,0 p.p.",
  );
  await expect(page.locator(".evolution-kpis .kpi strong")).toHaveText([
    "0",
    "1",
    "0",
    "0",
    "0",
  ]);
  expect(errors).toEqual([]);
});

test("falha de arquivo não vira ausência de escolas e permite tentar novamente", async ({
  page,
  context,
}) => {
  let fail = true;
  await setup(page, context, {
    respond: async (route, uf, year) => {
      if (!fail || year !== 2025) return false;
      await route.fulfill({ status: 503, body: "indisponível" });
      return true;
    },
  });
  await expect(page.locator(".longitudinal [role=alert]")).toContainText(
    "HTTP 503",
  );
  await expect(summary(page)).toHaveCount(0);
  fail = false;
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(summary(page)).toContainText("4 escolas comparáveis");
});

test("arquivos individuais ausentes mantêm a análise agregada disponível", async ({
  page,
  context,
}) => {
  const { requested } = await setup(page, context, {
    manifest: { ...manifest, schools_available: false },
  });
  await expect(page.locator(".longitudinal .message")).toContainText(
    "Arquivos anuais por escola indisponíveis",
  );
  expect(requested).toEqual([]);
  await page.getByRole("button", { name: "Panorama por ano" }).click();
  await expect(page.locator(".kpi.primary strong")).toHaveText("50,0%");
});

test("lista paginada limita o DOM e mantém pesquisa e transições", async ({
  page,
  context,
}) => {
  const { requested } = await setup(page, context, {
    respond: async (route, uf, year) => {
      await route.fulfill({
        json: {
          uf,
          year,
          schools: Array.from({ length: 120 }, (_, i) =>
            school(String(i + 1), year === 2020 ? 0 : 1),
          ),
        },
      });
      return true;
    },
  });
  await expect(summary(page)).toContainText("120 escolas comparáveis");
  await expect(page.locator(".schools-table tbody tr")).toHaveCount(50);
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(page.locator(".list-pagination")).toContainText("página 2 de 3");
  await expect(page.locator(".schools-table tbody tr").first()).toContainText(
    "Escola 51",
  );
  await page
    .getByRole("searchbox", { name: "Pesquisar escola ou código Inep" })
    .fill("120");
  await expect(page.locator(".schools-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".schools-table tbody tr")).toContainText(
    "Escola 120",
  );
  await expect(page.locator(".list-pagination")).toContainText("página 1 de 1");
  await page
    .getByRole("combobox", { name: "Transição", exact: true })
    .selectOption("worsened");
  await expect(page.locator(".schools-table")).toContainText("Nenhuma escola");
  expect(requested).toHaveLength(2);
});
