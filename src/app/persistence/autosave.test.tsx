import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { useTransientStore } from "../stores/transientStore";
import { useDocumentStore } from "../stores/documentStore";
import { useAutosave } from "./autosave";
import { loadActiveDocument, saveActiveDocument } from "./db";

vi.mock("./db", () => ({
  loadActiveDocument: vi.fn(),
  saveActiveDocument: vi.fn(),
}));

const loadActiveDocumentMock = vi.mocked(loadActiveDocument);
const saveActiveDocumentMock = vi.mocked(saveActiveDocument);

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadActiveDocumentMock.mockReset();
    saveActiveDocumentMock.mockReset();
    loadActiveDocumentMock.mockResolvedValue(null);
    saveActiveDocumentMock.mockResolvedValue(undefined);
    useDocumentStore.getState().reset();
    useTransientStore.getState().cancel();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates a restored document without dirtying it", async () => {
    const saved = createSampleDocument();
    saved.title = "Saved draft";
    loadActiveDocumentMock.mockResolvedValue(saved);

    renderHook(() => useAutosave(true));
    await act(async () => {
      await Promise.resolve();
    });

    expect(useDocumentStore.getState().doc.title).toBe("Saved draft");
    expect(useDocumentStore.getState().dirty).toBe(false);
    expect(useDocumentStore.getState().past).toHaveLength(0);
    expect(useDocumentStore.getState().lastRestoredAt).toBeDefined();
  });

  it("marks successful autosaves as saved", async () => {
    renderHook(() => useAutosave(true));

    act(() => {
      useDocumentStore
        .getState()
        .setActiveViewViewport({ x: 8, y: 16, zoom: 1.1 });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(saveActiveDocumentMock).toHaveBeenCalledTimes(1);
    expect(useDocumentStore.getState().dirty).toBe(false);
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
  });

  it("surfaces autosave failures", async () => {
    saveActiveDocumentMock.mockRejectedValue(new Error("Quota exceeded"));
    renderHook(() => useAutosave(true));

    act(() => {
      useDocumentStore
        .getState()
        .setActiveViewViewport({ x: 8, y: 16, zoom: 1.1 });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(useDocumentStore.getState().dirty).toBe(true);
    expect(useDocumentStore.getState().saveStatus).toBe("error");
    expect(useDocumentStore.getState().lastSaveError).toBe("Quota exceeded");
  });
});
