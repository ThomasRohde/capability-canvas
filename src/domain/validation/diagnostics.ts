export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}

export function error(
  code: string,
  message: string,
  nodeId?: string,
): Diagnostic {
  return { code, severity: "error", message, nodeId };
}

export function warning(
  code: string,
  message: string,
  nodeId?: string,
): Diagnostic {
  return { code, severity: "warning", message, nodeId };
}

export function info(
  code: string,
  message: string,
  nodeId?: string,
): Diagnostic {
  return { code, severity: "info", message, nodeId };
}
