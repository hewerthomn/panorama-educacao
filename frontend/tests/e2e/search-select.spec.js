import { test, expect } from "@playwright/test";

const control = (page) =>
  page.getByRole("combobox", { name: "Indicador", exact: true });
async function activate(locator, isMobile) {
  if (isMobile) await locator.tap();
  else await locator.click();
}
async function pointerSequence(page, events) {
  await page
    .getByRole("option", { name: "Água potável", exact: true })
    .evaluate(async (option, events) => {
      const box = option.getBoundingClientRect(),
        x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      for (const type of events) {
        if (type === "blur") {
          document.activeElement.blur();
          await new Promise(requestAnimationFrame);
          continue;
        }
        if (type === "scroll") {
          option.parentElement.scrollTop += 20;
          option.parentElement.dispatchEvent(new Event("scroll"));
          continue;
        }
        if (type === "click") {
          option.dispatchEvent(
            new MouseEvent("click", { bubbles: true, detail: 1 }),
          );
          continue;
        }
        option.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 21,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: type === "pointermove" ? y + 24 : y,
          }),
        );
      }
    }, events);
}

test.describe("SearchSelect", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tests/e2e/fixtures/search-select.html");
  });
  test("seleciona por toque ou mouse após pesquisar, atualiza uma vez e fecha", async ({
    page,
    isMobile,
  }) => {
    await control(page).fill("agua");
    await activate(
      page.getByRole("option", { name: "Água potável", exact: true }),
      isMobile,
    );
    await expect(page.getByTestId("selected")).toHaveText("water");
    await expect(page.getByTestId("changes")).toHaveText("1");
    await expect(control(page)).toHaveValue("Água potável");
    await expect(control(page)).toHaveAttribute("aria-expanded", "false");
    if (isMobile) {
      await expect(control(page)).not.toBeFocused();
      await expect(page.locator(".search-select")).toBeFocused();
    }
  });
  test("mantém a lista durante blur do toque e não depende do click de compatibilidade", async ({
    page,
  }) => {
    await control(page).fill("agua");
    await pointerSequence(page, ["pointerdown", "blur", "pointerup"]);
    await expect(page.getByTestId("selected")).toHaveText("water");
    await expect(page.getByTestId("changes")).toHaveText("1");
    await expect(control(page)).toHaveAttribute("aria-expanded", "false");
  });
  test("ignora o click posterior ao pointerup, sem emitir duas alterações", async ({
    page,
  }) => {
    await control(page).fill("agua");
    await pointerSequence(page, ["pointerdown", "pointerup", "click"]);
    await expect(page.getByTestId("selected")).toHaveText("water");
    await expect(page.getByTestId("changes")).toHaveText("1");
  });
  for (const gesture of ["pointermove", "scroll", "pointercancel"]) {
    test(`não escolhe durante ${gesture}, mesmo se vier um click depois`, async ({
      page,
      isMobile,
    }) => {
      await activate(control(page), isMobile);
      await pointerSequence(page, [
        "pointerdown",
        gesture,
        ...(gesture === "pointercancel" ? [] : ["pointerup"]),
        "click",
      ]);
      await expect(page.getByTestId("selected")).toHaveText("all");
      await expect(page.getByTestId("changes")).toHaveText("0");
      await expect(control(page)).toHaveAttribute("aria-expanded", "true");
      await control(page).fill("biblioteca");
      await activate(
        page.getByRole("option", { name: "Biblioteca", exact: true }),
        isMobile,
      );
      await expect(page.getByTestId("selected")).toHaveText("library");
      await expect(page.getByTestId("changes")).toHaveText("1");
    });
  }
  test("bloqueia eventos de mouse residuais sobre o campo sob a lista", async ({
    page,
  }) => {
    await control(page).fill("agua");
    const prevented = await page
      .getByRole("option", { name: "Água potável", exact: true })
      .evaluate((option) => {
        const b = option.getBoundingClientRect(),
          x = b.x + b.width / 2,
          y = b.y + b.height / 2;
        for (const type of ["pointerdown", "pointerup"])
          option.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerType: "touch",
              pointerId: 21,
              isPrimary: true,
              clientX: x,
              clientY: y,
            }),
          );
        return ["mousedown", "mouseup", "click"].map((type) => {
          const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            detail: 1,
            clientX: x,
            clientY: y,
          });
          document.body.dispatchEvent(event);
          return event.defaultPrevented;
        });
      });
    expect(prevented).toEqual([true, true, true]);
    await expect(page.getByTestId("changes")).toHaveText("1");
    // A subsequent genuine interaction must not be swallowed by the guard.
    await page.getByRole("button", { name: "Fora do filtro" }).click();
    await expect(page.getByTestId("outside-clicks")).toHaveText("1");
  });
  test("preserva Enter, Escape, Tab e a limpeza da seleção", async ({
    page,
  }) => {
    await control(page).fill("agua");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("selected")).toHaveText("water");
    await expect(page.getByTestId("changes")).toHaveText("1");
    await control(page).click();
    await page.keyboard.press("Escape");
    await expect(control(page)).toHaveAttribute("aria-expanded", "false");
    await control(page).click();
    await page.getByRole("button", { name: "Fora do filtro" }).focus();
    await expect(control(page)).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Limpar indicador" }).click();
    await expect(page.getByTestId("selected")).toHaveText("all");
    await expect(page.getByTestId("changes")).toHaveText("2");
    await control(page).focus();
    await page.keyboard.press("Tab");
    await expect(control(page)).toHaveAttribute("aria-expanded", "false");
  });
  test("permite escolher após rolar a lista e a sidebar", async ({
    page,
    isMobile,
  }) => {
    await activate(control(page), isMobile);
    await page
      .getByRole("listbox")
      .evaluate((list) => (list.scrollTop = list.scrollHeight));
    await activate(
      page.getByRole("option", { name: "Biblioteca", exact: true }),
      isMobile,
    );
    await expect(control(page)).toHaveValue("Biblioteca");
    await expect(page.getByTestId("changes")).toHaveText("1");
    await page
      .getByRole("complementary")
      .evaluate((sidebar) => (sidebar.scrollTop = 100));
    await control(page).fill("agua");
    await activate(
      page.getByRole("option", { name: "Água potável", exact: true }),
      isMobile,
    );
    await expect(control(page)).toHaveValue("Água potável");
  });
});

test("os três filtros atualizam a análise no drawer e no desktop", async ({
  page,
  isMobile,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?uf=RO");
  await expect(page.locator(".kpi.primary strong")).toHaveText("98,5%");
  if (isMobile)
    await page.getByRole("button", { name: "Filtros", exact: true }).tap();
  async function choose(label, query, name) {
    const input = page.getByRole("combobox", { name: label, exact: true });
    await input.fill(query);
    await activate(page.getByRole("option", { name, exact: true }), isMobile);
    await expect(input).toHaveValue(name);
    await expect(input).toHaveAttribute("aria-expanded", "false");
    if (isMobile)
      await expect(
        page.getByRole("combobox", { name: "Ano de referência", exact: true }),
      ).not.toBeFocused();
  }
  await choose("Indicador", "biblioteca", "Biblioteca");
  await expect(page.locator(".kpi.primary strong")).toHaveText("47,9%");
  await expect(page.locator(".analysis-block .panel-head p")).toContainText(
    "Biblioteca",
  );
  await expect(page.locator(".donut-total strong").first()).toHaveText("584");
  await choose("Município", "ariq", "Ariquemes");
  await expect(page.locator(".territory")).toContainText("Ariquemes");
  await choose("Estado", "acre", "Acre (AC)");
  await expect(page.locator(".territory")).toContainText("Acre");
  await expect(
    page.getByRole("combobox", { name: "Município", exact: true }),
  ).toHaveValue("Todos os municípios");
  if (isMobile) {
    // Viewport resize covers layout changes; Playwright does not open a real OS keyboard.
    await page.setViewportSize({ width: 390, height: 460 });
    await choose("Indicador", "internet", "Acesso à internet");
    await page
      .getByRole("button", { name: "Fechar filtros", exact: true })
      .tap();
    await page.getByRole("button", { name: "Filtros", exact: true }).tap();
    await choose("Município", "brasileia", "Brasiléia");
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await expect(page.locator(".map canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
