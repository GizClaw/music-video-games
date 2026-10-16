/** Hide a source line's final comma without changing punctuation within it. */
export function withoutTrailingComma(text) {
  return text.replace(/[,，](?=[^\S\r\n]*$)/gm, "");
}
