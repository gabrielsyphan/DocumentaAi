// Remove acentos e normaliza caixa preservando o comprimento do texto (1
// unidade UTF-16 → 1 unidade), para que buscas ("reuniao" encontra "Reunião")
// funcionem sem perder a correspondência de índices com o texto original.
// Compartilhado entre a busca na página (FindInPageBar) e o ⌘K (SearchModal).
export function foldText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const decomposed = text[i].normalize("NFD");
    const lower = (decomposed[0] ?? text[i]).toLowerCase();
    out += lower[0] ?? text[i];
  }
  return out;
}
