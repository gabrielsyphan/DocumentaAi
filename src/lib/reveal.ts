import { usePagesStore } from "../store/pages.store";
import { useUIStore } from "../store/ui.store";

/** Abre um item revelando-o na árvore da sidebar: expande os ancestrais e rola até ele. */
export function revealInTree(pageId: string) {
  const { pages, selectPage } = usePagesStore.getState();
  const { expandPage } = useUIStore.getState();

  const byId = new Map(pages.map((p) => [p.id, p]));
  let cur = byId.get(pageId)?.parent_id ?? null;
  const seen = new Set<string>(); // proteção contra ciclos de parent_id
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    expandPage(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  selectPage(pageId);
  // espera a árvore renderizar expandida antes de rolar até o item
  setTimeout(() => {
    document
      .querySelector(`.page-tree [data-page-id="${CSS.escape(pageId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 80);
}
