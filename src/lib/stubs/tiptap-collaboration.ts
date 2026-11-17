// Stands in for @tiptap/extension-collaboration in the browser bundle (see next.config.js).
// The drag handle only asks whether a transaction came from another collaborator: none do.
export function isChangeOrigin(): boolean {
  return false;
}
