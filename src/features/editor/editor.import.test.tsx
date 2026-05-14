import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import {
  serializeDocument,
  stringifyDocument,
} from "../../domain/document/serialize";
import { childrenOf } from "../../domain/document/types";
import {
  PROMPT_MERGE_SCHEMA,
  PROMPT_MERGE_VERSION,
} from "../../domain/promptMerge/payload";
import { installEditorTestHooks, renderEditor } from "../../test/editorHarness";

describe("editor import workflows", () => {
  installEditorTestHooks();

  it("imports a JSON document from the Import button", async () => {
    const importedDoc = {
      ...useDocumentStore.getState().doc,
      title: "Imported capability model",
    };
    const showSaveFilePicker = vi.fn();
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);

    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import JSON file" }),
    );
    const input = document.querySelector(
      'input[type="file"][accept=".json,application/json"]',
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toBe(".json,application/json");
    const file = {
      text: async () => stringifyDocument(importedDoc),
    } as File;
    fireEvent.change(input, { target: { files: [file] } });

    const review = await screen.findByRole("dialog", {
      name: "Review import",
    });
    expect(
      within(review).getByText("Imported capability model"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(review).getByRole("button", { name: "Apply import" }),
    );

    await waitFor(() =>
      expect(useDocumentStore.getState().doc.title).toBe(
        "Imported capability model",
      ),
    );
    expect(showSaveFilePicker).not.toHaveBeenCalled();
  });

  it("imports pasted JSON from a textarea dialog", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });
    const importedDoc = {
      ...useDocumentStore.getState().doc,
      title: "Pasted capability model",
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: stringifyDocument(importedDoc) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );

    const review = await screen.findByRole("dialog", {
      name: "Review import",
    });
    await userEvent.click(
      within(review).getByRole("button", { name: "Apply import" }),
    );

    expect(useDocumentStore.getState().doc.title).toBe(
      "Pasted capability model",
    );
  });

  it("shows repair diagnostics before applying pasted document JSON", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });
    const wire = serializeDocument(useDocumentStore.getState().doc);
    const duplicateSource = wire.nodes.find(
      (node) => node.id === "digital-servicing",
    )!;
    wire.nodes.push({
      ...duplicateSource,
      id: "digital-onboarding",
      label: "Duplicate onboarding",
    });

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: JSON.stringify(wire) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );

    const review = await screen.findByRole("dialog", {
      name: "Review import",
    });
    expect(
      within(review).getByText("Duplicate ID repairs"),
    ).toBeInTheDocument();
    expect(
      within(review).getByText("duplicate-id-repaired"),
    ).toBeInTheDocument();
    expect(useDocumentStore.getState().doc.title).toBe(
      "Retail Bank Capability Model",
    );
  });

  it("reviews invalid pasted JSON without allowing apply", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "{" },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );

    const review = await screen.findByRole("dialog", {
      name: "Review import",
    });
    expect(within(review).getByText("json-invalid")).toBeInTheDocument();
    expect(
      within(review).getByRole("button", { name: "Apply import" }),
    ).toBeDisabled();
  });

  it("cancels import review without changing the current document", async () => {
    const before = useDocumentStore.getState();
    const beforeNodeCount = Object.keys(before.doc.nodesById).length;
    const beforeSelected = [...useUiStore.getState().selectedNodeIds];
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });
    const importedDoc = {
      ...useDocumentStore.getState().doc,
      title: "Canceled capability model",
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: stringifyDocument(importedDoc) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );
    const review = await screen.findByRole("dialog", {
      name: "Review import",
    });
    await userEvent.click(
      within(review).getByRole("button", { name: "Cancel" }),
    );

    const after = useDocumentStore.getState();
    expect(after.doc.title).toBe("Retail Bank Capability Model");
    expect(Object.keys(after.doc.nodesById)).toHaveLength(beforeNodeCount);
    expect(after.past).toHaveLength(before.past.length);
    expect(after.dirty).toBe(before.dirty);
    expect(useUiStore.getState().selectedNodeIds).toEqual(beforeSelected);
  });

  it("requires confirmation before replacing a dirty document", async () => {
    useDocumentStore
      .getState()
      .setActiveViewViewport({ x: 12, y: 18, zoom: 1.1 });
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });
    const importedDoc = {
      ...useDocumentStore.getState().doc,
      title: "Dirty replacement model",
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: stringifyDocument(importedDoc) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );
    const review = await screen.findByRole("dialog", {
      name: "Review import",
    });
    await userEvent.click(
      within(review).getByRole("button", { name: "Apply import" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Replace unsaved document?" }),
    ).toBeInTheDocument();
    expect(useDocumentStore.getState().doc.title).toBe(
      "Retail Bank Capability Model",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Replace document" }),
    );

    await waitFor(() =>
      expect(useDocumentStore.getState().doc.title).toBe(
        "Dirty replacement model",
      ),
    );
  });

  it("downloads the current document as a backup from import review", async () => {
    const write = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    const close = vi.fn<() => Promise<void>>().mockResolvedValue();
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: async () => ({ write, close }),
    });
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });
    const importedDoc = {
      ...useDocumentStore.getState().doc,
      title: "Backup target model",
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: stringifyDocument(importedDoc) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );
    const review = await screen.findByRole("dialog", {
      name: "Review import",
    });
    await userEvent.click(
      within(review).getByRole("button", {
        name: "Download current backup",
      }),
    );

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toContain("Retail Bank Capability Model");
    expect(write.mock.calls[0]?.[0]).not.toContain("Backup target model");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("copies a customized leaf expansion AI prompt from the node context menu", async () => {
    const writeText = stubClipboard();
    renderEditor();

    const canvas = screen.getByTestId("canvas");
    const node = within(canvas)
      .getByText("Digital Onboarding")
      .closest(".cc-node") as HTMLElement;
    fireEvent.contextMenu(node, { clientX: 120, clientY: 140 });
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Copy AI prompt..." }),
    );
    const dialog = screen.getByRole("dialog", { name: "Copy AI prompt" });
    const count = within(dialog).getByLabelText("Direct capabilities");
    const additions = within(dialog).getByLabelText("Additional instructions");
    fireEvent.change(count, { target: { value: "8" } });
    fireEvent.change(additions, {
      target: {
        value: "Use card onboarding examples and make the rationale specific.",
      },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Prompt copied",
    );
    const prompt = writeText.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("Create 8 direct child capabilities");
    expect(prompt).toContain(PROMPT_MERGE_SCHEMA);
    expect(prompt).toContain('"targetId": "digital-onboarding"');
    expect(prompt).toContain("# Additional instructions");
    expect(prompt).toContain(
      "Use card onboarding examples and make the rationale specific.",
    );
    expect(prompt).toContain("```json");
  });

  it("copies a non-leaf AI prompt with merge context", async () => {
    const writeText = stubClipboard();
    renderEditor();

    const canvas = screen.getByTestId("canvas");
    const node = within(canvas)
      .getByText("Customer")
      .closest(".cc-node") as HTMLElement;
    fireEvent.contextMenu(node, { clientX: 120, clientY: 140 });
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Copy AI prompt..." }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Copy AI prompt" })).getByRole(
        "button",
        { name: "Copy" },
      ),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const prompt = writeText.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("Create or refine 5 direct child capabilities");
    expect(prompt).toContain('"id": "channels"');
    expect(prompt).toContain('"id": "digital-onboarding"');
  });

  it("imports prompt merge JSON without replacing the document", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });
    const payload = {
      schema: PROMPT_MERGE_SCHEMA,
      version: PROMPT_MERGE_VERSION,
      targetId: "digital-onboarding",
      capabilities: [
        {
          id: "identity-verification",
          name: "Identity Verification",
          description: "Confirms customer identity for digital onboarding.",
        },
      ],
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: JSON.stringify(payload) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );

    const doc = useDocumentStore.getState().doc;
    expect(doc.title).toBe("Retail Bank Capability Model");
    expect(doc.nodesById["retail-banking"]).toBeDefined();
    expect(doc.nodesById["digital-onboarding"]).toMatchObject({
      type: "parent",
    });
    expect(
      screen.queryByRole("dialog", { name: "Review import" }),
    ).not.toBeInTheDocument();
    expect(childrenOf(doc, "digital-onboarding")).toContain(
      "identity-verification",
    );
    expect(doc.nodesById["identity-verification"]).toMatchObject({
      parentId: "digital-onboarding",
      isOnCanvas: true,
    });
  });

  it("imports fenced prompt merge JSON from the toolbar paste dialog", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });
    const payload = {
      schema: PROMPT_MERGE_SCHEMA,
      version: PROMPT_MERGE_VERSION,
      targetId: "digital-onboarding",
      capabilities: [
        {
          id: "application-capture",
          name: "Application Capture",
          description: "Captures customer application details for onboarding.",
        },
      ],
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`` },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );

    expect(
      childrenOf(useDocumentStore.getState().doc, "digital-onboarding"),
    ).toContain("application-capture");
  });

  it("imports scoped AI JSON from the node context menu", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    const node = within(canvas)
      .getByText("Digital Onboarding")
      .closest(".cc-node") as HTMLElement;
    fireEvent.contextMenu(node, { clientX: 120, clientY: 140 });
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import AI JSON..." }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Import AI JSON",
    });
    const payload = {
      schema: PROMPT_MERGE_SCHEMA,
      version: PROMPT_MERGE_VERSION,
      targetId: "digital-onboarding",
      capabilities: [
        {
          id: "eligibility-assessment",
          name: "Eligibility Assessment",
          description: "Determines whether an applicant qualifies for onboarding.",
        },
      ],
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: JSON.stringify(payload) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );

    expect(
      childrenOf(useDocumentStore.getState().doc, "digital-onboarding"),
    ).toContain("eligibility-assessment");
    expect(
      screen.queryByRole("dialog", { name: "Review import" }),
    ).not.toBeInTheDocument();
  });

  it("imports scoped AI JSON directly from clipboard without opening the dialog", async () => {
    const payload = {
      schema: PROMPT_MERGE_SCHEMA,
      version: PROMPT_MERGE_VERSION,
      targetId: "digital-onboarding",
      capabilities: [
        {
          id: "consent-capture",
          name: "Consent Capture",
          description: "Records customer consent during onboarding.",
        },
      ],
    };
    const restoreClipboard = stubClipboardReadText(JSON.stringify(payload));

    try {
      renderEditor();
      const canvas = screen.getByTestId("canvas");
      const node = within(canvas)
        .getByText("Digital Onboarding")
        .closest(".cc-node") as HTMLElement;
      fireEvent.contextMenu(node, { clientX: 120, clientY: 140 });
      await userEvent.click(
        screen.getByRole("menuitem", { name: "Import AI JSON..." }),
      );

      await waitFor(() =>
        expect(
          childrenOf(useDocumentStore.getState().doc, "digital-onboarding"),
        ).toContain("consent-capture"),
      );
      expect(
        screen.queryByRole("dialog", { name: "Import AI JSON" }),
      ).not.toBeInTheDocument();
    } finally {
      restoreClipboard();
    }
  });

  it("rejects scoped AI JSON with a different targetId", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    const node = within(canvas)
      .getByText("Digital Onboarding")
      .closest(".cc-node") as HTMLElement;
    fireEvent.contextMenu(node, { clientX: 120, clientY: 140 });
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import AI JSON..." }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Import AI JSON",
    });
    const payload = {
      schema: PROMPT_MERGE_SCHEMA,
      version: PROMPT_MERGE_VERSION,
      targetId: "risk",
      capabilities: [{ id: "mismatch", name: "Mismatch" }],
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: JSON.stringify(payload) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );

    expect(
      childrenOf(useDocumentStore.getState().doc, "digital-onboarding"),
    ).not.toContain("mismatch");
    expect(useDocumentStore.getState().lastDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "prompt-merge-target-mismatch" }),
      ]),
    );
    expect(dialog).toBeInTheDocument();
  });

  it("rejects full document JSON from scoped AI import without review", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    const node = within(canvas)
      .getByText("Digital Onboarding")
      .closest(".cc-node") as HTMLElement;
    fireEvent.contextMenu(node, { clientX: 120, clientY: 140 });
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import AI JSON..." }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Import AI JSON",
    });
    const importedDoc = {
      ...useDocumentStore.getState().doc,
      title: "Should not replace",
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: stringifyDocument(importedDoc) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );

    expect(useDocumentStore.getState().doc.title).toBe(
      "Retail Bank Capability Model",
    );
    expect(
      screen.queryByRole("dialog", { name: "Review import" }),
    ).not.toBeInTheDocument();
    expect(useDocumentStore.getState().lastDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "prompt-merge-required" }),
      ]),
    );
  });
});

function stubClipboard() {
  const writeText = vi
    .fn<(text: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

function stubClipboardReadText(text: string): () => void {
  const previous = navigator.clipboard;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      readText: async () => text,
    },
  });
  return () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: previous,
    });
  };
}
