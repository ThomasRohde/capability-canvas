import { describe, expect, it } from "vitest";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { importHeatmapCsv, parseCsvRecords } from "./csvImport";

describe("heatmap CSV import", () => {
  it("parses escaped quotes and quoted multiline fields", () => {
    expect(
      parseCsvRecords('id,value,note\n"cap ""one""",0.5,"line 1\nline 2"'),
    ).toEqual([
      ["id", "value", "note"],
      ['cap "one"', "0.5", "line 1\nline 2"],
    ]);
  });

  it("imports heatmap values from quoted CSV rows", () => {
    const doc = createSampleDocument();
    const result = importHeatmapCsv(
      doc,
      'label,value\n"Digital Onboarding",0.91',
      { matchBy: "label" },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.transactions).toHaveLength(1);
  });
});
