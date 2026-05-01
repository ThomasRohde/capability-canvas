import { updateNode } from '../../domain/commands/operations';
import type { Transaction } from '../../domain/commands/types';
import type { CapabilityDocument, NodeId } from '../../domain/document/types';
import { warning, type Diagnostic } from '../../domain/validation/diagnostics';

export function importHeatmapCsv(
  doc: CapabilityDocument,
  csv: string,
  options: { keyColumn?: string; valueColumn?: string; matchBy?: 'id' | 'label' } = {}
): { transactions: Transaction[]; diagnostics: Diagnostic[] } {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { transactions: [], diagnostics: [warning('csv-empty', 'CSV contains no data rows.')] };
  const header = splitCsvLine(lines[0]!);
  const keyIndex = header.indexOf(options.keyColumn ?? (options.matchBy === 'label' ? 'label' : 'id'));
  const valueIndex = header.indexOf(options.valueColumn ?? 'value');
  if (keyIndex < 0 || valueIndex < 0) {
    return { transactions: [], diagnostics: [warning('csv-columns-missing', 'CSV must include key and value columns.')] };
  }

  const transactions: Transaction[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const line of lines.slice(1)) {
    const columns = splitCsvLine(line);
    const key = columns[keyIndex]?.trim();
    const rawValue = columns[valueIndex]?.trim();
    const value = Number(rawValue);
    if (!key || Number.isNaN(value) || value < 0 || value > 1) {
      diagnostics.push(warning('csv-row-invalid', `Skipped heatmap row "${line}".`));
      continue;
    }
    const nodeId = findNode(doc, key, options.matchBy ?? 'id');
    if (!nodeId) {
      diagnostics.push(warning('csv-node-not-found', `No node matched "${key}".`));
      continue;
    }
    transactions.push(updateNode(nodeId, { heatmapValue: value }));
  }
  return { transactions, diagnostics };
}

function findNode(doc: CapabilityDocument, key: string, matchBy: 'id' | 'label'): NodeId | null {
  if (matchBy === 'id' && doc.nodesById[key]) return key;
  const found = Object.values(doc.nodesById).find((node) => node.label.toLowerCase() === key.toLowerCase());
  return found?.id ?? null;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

