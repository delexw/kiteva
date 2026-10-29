import type { Page } from "puppeteer-core";

/** Wait for the active virtual row rather than racing React's keyboard update. */
export async function nextSelectOption(page: Page) {
  const previous = await page.$eval(
    ".ant-select-dropdown:not(.ant-select-dropdown-hidden)",
    (dropdown) => dropdown.querySelector(".ant-select-item-option-active")?.textContent,
  );
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    (last) => {
      const active = document.querySelector(
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-active",
      );
      return active && active.textContent !== last;
    },
    {},
    previous,
  );
}
