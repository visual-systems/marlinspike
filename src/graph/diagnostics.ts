// Diagnostic types for the constraint system.

export interface Diagnostic {
  /** Constraint ID that produced this diagnostic. */
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  entityId: string;
}

export type DiagnosticMap = Record<string, Diagnostic[]>;
