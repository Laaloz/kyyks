import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraCapture } from "@/components/workout/camera-capture";

afterEach(() => {
  cleanup();
});

// jsdom:ssa ei ole getUserMediaa → komponentti näyttää "ei tuettu" -tilan, mutta kuvaustilan
// valitsin renderöityy silti (alapalkki ei riipu kamerastatuksesta).
describe("CameraCapture", () => {
  it("näyttää kuvaustilat ja oletuksena annoksen", () => {
    render(<CameraCapture onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "Annos" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Etiketti" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("radio", { name: "Viivakoodi" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/AI arvioi sisällön ja määrän/)).toBeTruthy();
  });

  it("tilan vaihto päivittää valinnan ja ohjetekstin", () => {
    render(<CameraCapture onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Etiketti" }));
    expect(screen.getByRole("radio", { name: "Etiketti" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/arvot luetaan suoraan etiketistä/)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Viivakoodi" }));
    expect(screen.getByText(/arvot haetaan tuotetietokannasta/)).toBeTruthy();
  });

  it("välittää valitun tilan tiedostovalinnan mukana", () => {
    const onPickFile = vi.fn();
    const { container } = render(<CameraCapture onCapture={vi.fn()} onPickFile={onPickFile} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Viivakoodi" }));
    const fileInput = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "kuva.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onPickFile).toHaveBeenCalledWith(file, "barcode");
  });
});
