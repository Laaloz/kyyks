import { afterEach, describe, expect, it } from "vitest";

import { isVirtualKeyboardOpen } from "@/lib/mobile-keyboard";

const LAYOUT_HEIGHT = 800;
const KEYBOARD_OPEN_HEIGHT = 450; // ~44 % näppäimistölle → viewport kutistunut
const FULL_VIEWPORT_HEIGHT = 790; // näppäimistö kiinni → ei kutistumaa

function mountInput(): HTMLInputElement {
  const input = document.createElement("input");
  document.body.appendChild(input);
  return input;
}

function mountButton(): HTMLButtonElement {
  const button = document.createElement("button");
  document.body.appendChild(button);
  return button;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isVirtualKeyboardOpen", () => {
  it("on auki kun tekstikenttä on fokuksessa JA viewport kutistunut (aidosti kirjoitetaan)", () => {
    const input = mountInput();
    expect(
      isVirtualKeyboardOpen({
        activeElement: input,
        visualViewportHeight: KEYBOARD_OPEN_HEIGHT,
        layoutViewportHeight: LAYOUT_HEIGHT,
      }),
    ).toBe(true);
  });

  it("ei ole auki kun kenttä on fokuksessa mutta viewport on täysi (regressio: jäänyt fokus ohjelman luonnin jälkeen)", () => {
    const input = mountInput();
    // Tämä on bugin ydin: ennen korjausta pelkkä fokus piti navin piilossa.
    expect(
      isVirtualKeyboardOpen({
        activeElement: input,
        visualViewportHeight: FULL_VIEWPORT_HEIGHT,
        layoutViewportHeight: LAYOUT_HEIGHT,
      }),
    ).toBe(false);
  });

  it("ei ole auki kun viewport on kutistunut mutta fokus ei ole tekstikentässä (esim. tilapäinen iOS-mittaus)", () => {
    const button = mountButton();
    expect(
      isVirtualKeyboardOpen({
        activeElement: button,
        visualViewportHeight: KEYBOARD_OPEN_HEIGHT,
        layoutViewportHeight: LAYOUT_HEIGHT,
      }),
    ).toBe(false);
  });

  it("ei ole auki ilman fokusta ja täydellä viewportilla", () => {
    expect(
      isVirtualKeyboardOpen({
        activeElement: document.body,
        visualViewportHeight: FULL_VIEWPORT_HEIGHT,
        layoutViewportHeight: LAYOUT_HEIGHT,
      }),
    ).toBe(false);
  });

  it("tunnistaa contentEditable-kentän fokuksen", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.appendChild(editable);
    expect(
      isVirtualKeyboardOpen({
        activeElement: editable,
        visualViewportHeight: KEYBOARD_OPEN_HEIGHT,
        layoutViewportHeight: LAYOUT_HEIGHT,
      }),
    ).toBe(true);
  });

  it("ei ole auki kun visualViewport puuttuu (ei kutistumatietoa)", () => {
    const input = mountInput();
    expect(
      isVirtualKeyboardOpen({
        activeElement: input,
        visualViewportHeight: null,
        layoutViewportHeight: LAYOUT_HEIGHT,
      }),
    ).toBe(false);
  });
});
