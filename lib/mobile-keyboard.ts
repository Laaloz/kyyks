// Mobiilin virtuaalinäppäimistön tunnistus alanavin piilotusta varten.
//
// Aiemmin riitti joko tekstikentän fokus TAI viewportin kutistuminen, mikä
// piilotti alanavin vahingossa: esim. ohjelman luonnin jälkeen lomakkeen
// tekstikenttään saattoi jäädä fokus ilman avointa näppäimistöä, jolloin navi
// katosi. Aito näppäimistö vaatii MOLEMMAT: fokus tekstikentässä JA viewportin
// kutistuminen (näppäimistö vie ruudusta tilaa). Näin satunnainen jäänyt fokus
// tai tilapäinen viewport-mittaus iOS:llä ei enää piilota navia.

// Näppäimistö katsotaan auki olevaksi, kun viewport on kutistunut alle tämän
// osuuden layout-viewportista (näppäimistö vie tyypillisesti ~35–45 %).
const VIEWPORT_REDUCED_RATIO = 0.8;

export function isTextInputElement(element: Element | null): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (element instanceof HTMLElement) {
    // isContentEditable kattaa peritytkin contenteditable-arvot oikeissa selaimissa.
    // Varmistetaan boolean (jsdom voi palauttaa undefinedin) ja luetaan attribuutti
    // varalle testiympäristöä varten.
    if (element.isContentEditable === true) {
      return true;
    }
    const attr = element.getAttribute("contenteditable");
    return attr === "" || attr === "true" || attr === "plaintext-only";
  }

  return false;
}

export function isVirtualKeyboardOpen(params: {
  activeElement: Element | null;
  visualViewportHeight: number | null;
  layoutViewportHeight: number;
}): boolean {
  const { activeElement, visualViewportHeight, layoutViewportHeight } = params;

  const focusOnTextInput = isTextInputElement(activeElement);
  const viewportReduced =
    visualViewportHeight != null && layoutViewportHeight > 0
      ? visualViewportHeight < layoutViewportHeight * VIEWPORT_REDUCED_RATIO
      : false;

  return focusOnTextInput && viewportReduced;
}
