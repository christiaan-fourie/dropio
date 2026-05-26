export const MAX_UNDO_HISTORY = 50;

export function cloneEditorDocument({ elements, artboard, selectedIds }) {
  return {
    elements: (elements || []).map((el) => ({ ...el })),
    artboard: { ...(artboard || {}) },
    selectedIds: [...(selectedIds || [])],
  };
}

export function sanitizeSelection(selectedIds, elements) {
  const ids = new Set((elements || []).map((el) => el.id));
  return (selectedIds || []).filter((id) => ids.has(id));
}
