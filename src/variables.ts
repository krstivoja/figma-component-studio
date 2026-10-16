/// <reference types="@figma/plugin-typings" />

// Figma keeps soft-deleted variables (for undo) and still returns them by id; only the collection's list is authoritative.
export async function getLiveVariable(id: string): Promise<Variable | null> {
  const v = await figma.variables.getVariableByIdAsync(id).catch(() => null);
  if (!v) return null;
  if (v.remote) return v;
  const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId).catch(() => null);
  return col && col.variableIds.includes(v.id) ? v : null;
}
