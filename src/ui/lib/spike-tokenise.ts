// Spike-Clojure tokeniser — converts source text to a token stream.
// Used for syntax highlighting in the code view and story previews.

export type TokenKind =
  | "comment"
  | "string"
  | "atom"
  | "typeName"
  | "keyword"
  | "number"
  | "bracket";

export const TOKEN_COLORS: Record<TokenKind, string> = {
  comment: "#6272a4",
  string: "#f1fa8c",
  atom: "#bd93f9",
  typeName: "#8be9fd",
  keyword: "#ff79c6",
  number: "#bd93f9",
  bracket: "#f8f8f2",
};

export type Token = { text: string; kind: TokenKind | null };

export function tokeniseJson(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    // whitespace
    if (/\s/.test(code[i])) {
      let j = i + 1;
      while (j < code.length && /\s/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), kind: null });
      i = j;
      continue;
    }
    // string
    if (code[i] === '"') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\" && j + 1 < code.length) {
          j += 2;
          continue;
        }
        if (code[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ text: code.slice(i, j), kind: "string" });
      i = j;
      continue;
    }
    // brackets / punctuation
    if ("[]{}".includes(code[i])) {
      tokens.push({ text: code[i], kind: "bracket" });
      i++;
      continue;
    }
    if (":,".includes(code[i])) {
      tokens.push({ text: code[i], kind: null });
      i++;
      continue;
    }
    // number
    if (/[-\d]/.test(code[i])) {
      let j = i + 1;
      while (j < code.length && /[0-9.eE+\-]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), kind: "number" });
      i = j;
      continue;
    }
    // keyword: true / false / null
    let j = i + 1;
    while (j < code.length && /[a-z]/.test(code[j])) j++;
    const word = code.slice(i, j);
    tokens.push({ text: word, kind: ["true", "false", "null"].includes(word) ? "atom" : null });
    i = j;
  }
  return tokens;
}

export function tokenise(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    // whitespace / commas (EDN treats commas as whitespace)
    if (/[\s,]/.test(code[i])) {
      let j = i + 1;
      while (j < code.length && /[\s,]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), kind: null });
      i = j;
      continue;
    }
    // line comment
    if (code[i] === ";") {
      let j = i;
      while (j < code.length && code[j] !== "\n") j++;
      tokens.push({ text: code.slice(i, j), kind: "comment" });
      i = j;
      continue;
    }
    // string literal
    if (code[i] === '"') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\" && j + 1 < code.length) {
          j += 2;
          continue;
        }
        if (code[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ text: code.slice(i, j), kind: "string" });
      i = j;
      continue;
    }
    // keyword :foo
    if (code[i] === ":") {
      let j = i + 1;
      while (j < code.length && !/[\s,()[\]{}"`;]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), kind: "atom" });
      i = j;
      continue;
    }
    // tagged literal #tag
    if (code[i] === "#") {
      let j = i + 1;
      while (j < code.length && !/[\s,()[\]{}"`;]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), kind: "typeName" });
      i = j;
      continue;
    }
    // brackets
    if ("()[]{}".includes(code[i])) {
      tokens.push({ text: code[i], kind: "bracket" });
      i++;
      continue;
    }
    // symbol / number / special form
    let j = i + 1;
    while (j < code.length && !/[\s,()[\]{}"`;]/.test(code[j])) j++;
    const word = code.slice(i, j);
    let kind: TokenKind | null = null;
    if (/^-?\d/.test(word)) kind = "number";
    else if (["def", "defn", "fn", "let", "do", "if", "when", "case"].includes(word)) {
      kind = "keyword";
    } else if (["nil", "true", "false"].includes(word)) kind = "atom";
    tokens.push({ text: word, kind });
    i = j;
  }
  return tokens;
}
