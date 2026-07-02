import { useEffect, useLayoutEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { X } from "lucide-react";
import type { Page } from "../../types";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  type: Page["type"];
  degree: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: "wikilink" | "hierarchy";
}

// Coleta pageIds a partir do inline content do BlockNote.
// O propSchema do WikiLink é: { title, pageId } — a prop chave é "pageId"
function walkBlocksForIds(blocks: unknown[], acc: string[]) {
  if (!Array.isArray(blocks)) return;
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as Record<string, unknown>;
    if (Array.isArray(block.content)) {
      for (const inline of block.content) {
        const il = inline as Record<string, unknown>;
        if (il.type === "wikilink") {
          const props = il.props as Record<string, unknown> | undefined;
          const id = props?.pageId;
          if (typeof id === "string" && id) acc.push(id);
        }
      }
    }
    if (Array.isArray(block.children)) walkBlocksForIds(block.children, acc);
  }
}

function extractLinkedIds(content: string | null, titleToId: Map<string, string>): string[] {
  if (!content) return [];
  const ids: string[] = [];

  // Wikilinks via BlockNote (usa pageId direto — robusto a renomeações)
  try { walkBlocksForIds(JSON.parse(content), ids); } catch { /* não é JSON */ }

  // Fallback: [[título]] como texto literal
  const textRe = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = textRe.exec(content)) !== null) {
    const id = titleToId.get(m[1].trim().toLowerCase());
    if (id) ids.push(id);
  }

  return [...new Set(ids)];
}

const NODE_COLORS: Record<Page["type"], string> = {
  document: "#9480f5",
  daily:    "#818cf8",
  canvas:   "#f59e0b",
  folder:   "#64748b",
};


function nodeRadius(degree: number) { return 7 + Math.min(degree * 1.5, 10); }
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

export default function GraphView({
  pages,
  selectedPageId,
  onSelectPage,
  onClose,
}: {
  pages: Page[];
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Refs estáveis para callbacks — evitam recriar a simulação a cada render
  const onSelectRef = useRef(onSelectPage);
  const onCloseRef  = useRef(onClose);
  useLayoutEffect(() => {
    onSelectRef.current = onSelectPage;
    onCloseRef.current  = onClose;
  });

  const { nodes, links } = useMemo(() => {
    const pageIds   = new Set(pages.map((p) => p.id));
    const titleToId = new Map(pages.map((p) => [p.title.trim().toLowerCase(), p.id]));
    const degreeMap = new Map<string, number>();
    const seen      = new Set<string>();
    const links: GraphLink[] = [];

    function addLink(src: string, tgt: string, kind: GraphLink["kind"]) {
      const key = `${src}→${tgt}`;
      if (seen.has(key) || !pageIds.has(src) || !pageIds.has(tgt)) return;
      seen.add(key);
      links.push({ source: src, target: tgt, kind });
      degreeMap.set(src, (degreeMap.get(src) ?? 0) + 1);
      degreeMap.set(tgt, (degreeMap.get(tgt) ?? 0) + 1);
    }

    for (const page of pages) {
      // 1. Wikilinks e [[título]] no conteúdo
      for (const tgt of extractLinkedIds(page.content, titleToId)) {
        if (tgt !== page.id) addLink(page.id, tgt, "wikilink");
      }
      // 2. Hierarquia pai → filho
      if (page.parent_id) addLink(page.parent_id, page.id, "hierarchy");
    }

    const nodes: GraphNode[] = pages.map((p) => ({
      id:     p.id,
      title:  p.title,
      type:   p.type,
      degree: degreeMap.get(p.id) ?? 0,
    }));

    return { nodes, links };
  }, [pages]);

  // ── Simulação D3 — só recria quando os dados mudam ──────────────────────────
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const W = rect.width  || 800;
    const H = rect.height || 560;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).attr("width", W).attr("height", H);

    // Marcadores de seta diferenciados por tipo de aresta
    const defs = svg.append("defs");
    [
      { id: "gv-arrow-wiki", color: "rgba(148,128,245,0.6)" },
      { id: "gv-arrow-hier", color: "rgba(100,116,139,0.5)" },
    ].forEach(({ id, color }) => {
      defs.append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -4 8 8")
        .attr("refX", 16).attr("refY", 0)
        .attr("markerWidth", 5).attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4L8,0L0,4")
        .attr("fill", color);
    });

    const container = svg.append("g").attr("class", "graph-root");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (ev) => container.attr("transform", ev.transform));
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2));

    const simNodes: GraphNode[] = nodes.map((n) => ({ ...n }));
    const simLinks: GraphLink[] = links.map((l) => ({
      source: l.source as string,
      target: l.target as string,
      kind:   l.kind,
    }));

    const simulation = d3.forceSimulation<GraphNode>(simNodes)
      .force("link",      d3.forceLink<GraphNode, GraphLink>(simLinks)
                            .id((d) => d.id)
                            .distance((l) => (l as GraphLink).kind === "hierarchy" ? 70 : 110)
                            .strength(0.6))
      .force("charge",    d3.forceManyBody<GraphNode>().strength(-260))
      .force("center",    d3.forceCenter(0, 0))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d.degree) + 6));

    const linkSel = container.append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(simLinks)
      .join("line")
      .attr("stroke",           (d) => d.kind === "wikilink"
        ? "rgba(148,128,245,0.45)"
        : "rgba(100,116,139,0.4)")
      .attr("stroke-width",     (d) => d.kind === "hierarchy" ? 1 : 1.5)
      .attr("stroke-dasharray", (d) => d.kind === "hierarchy" ? "4 3" : null)
      .attr("marker-end",       (d) => `url(#${d.kind === "wikilink" ? "gv-arrow-wiki" : "gv-arrow-hier"})`);

    const nodeG = container.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(simNodes)
      .join("g")
      .attr("class", "graph-node")
      .style("cursor", "pointer")
      .on("click", (_ev, d) => { onSelectRef.current(d.id); onCloseRef.current(); });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeG.call(d3.drag<SVGGElement, GraphNode>()
      .on("start", (ev, d) => { if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end",   (ev, d) => { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }) as any);

    nodeG.append("circle")
      .attr("r",       (d) => nodeRadius(d.degree))
      .attr("fill",    (d) => NODE_COLORS[d.type] ?? "#9480f5")
      .attr("opacity", 0.9);

    // Ícone Lucide dentro de cada nó (SVG elements escalados)
    nodeG.each(function(d) {
      const r   = nodeRadius(d.degree);
      const px  = r * 1.0;        // ícone ocupa ~100% do raio
      const sc  = px / 24;        // Lucide é 24×24
      const off = -px / 2;
      const sw  = 1.5 / sc;       // stroke-width em coordenadas locais

      const ig = d3.select(this).append("g")
        .attr("transform", `translate(${off},${off}) scale(${sc})`)
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.85)")
        .attr("stroke-width", sw)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("pointer-events", "none");

      switch (d.type) {
        case "document":
          ig.append("path").attr("d", "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z");
          ig.append("path").attr("d", "M14 2v6h6");
          ig.append("path").attr("d", "M16 13H8M16 17H8M10 9H8");
          break;
        case "daily":
          ig.append("rect").attr("x","3").attr("y","4").attr("width","18").attr("height","18").attr("rx","2");
          ig.append("path").attr("d", "M8 2v4M16 2v4M3 10h18");
          ig.append("path").attr("d", "M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01");
          break;
        case "canvas":
          ig.append("path").attr("d", "m12 19 7-7 3 3-7 7-3-3z");
          ig.append("path").attr("d", "m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z");
          ig.append("circle").attr("cx","11").attr("cy","11").attr("r","2");
          break;
        case "folder":
          ig.append("path").attr("d", "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z");
          break;
      }
    });

    nodeG.append("text")
      .text((d) => truncate(d.title, 20))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => nodeRadius(d.degree) + 13)
      .attr("font-size", 10)
      .attr("fill", "var(--sidebar-text)")
      .attr("pointer-events", "none");

    const tooltip = d3.select("body").append("div").attr("class", "graph-tooltip");
    nodeG
      .on("mouseenter", (ev, d) => tooltip.style("display","block").style("left",`${ev.pageX+10}px`).style("top",`${ev.pageY-28}px`).text(d.title))
      .on("mousemove",  (ev)     => tooltip.style("left",`${ev.pageX+10}px`).style("top",`${ev.pageY-28}px`))
      .on("mouseleave", ()       => tooltip.style("display","none"));

    simulation.on("tick", () => {
      linkSel
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);
      nodeG.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { simulation.stop(); tooltip.remove(); };
  }, [nodes, links]);

  // Atualiza destaque do nó selecionado sem recriar a simulação
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGCircleElement, GraphNode>(".graph-node circle")
      .attr("stroke",       (d) => d.id === selectedPageId ? "#fff" : "transparent")
      .attr("stroke-width", 2);
  }, [selectedPageId, nodes]);

  const wikilinkCount  = links.filter((l) => l.kind === "wikilink").length;
  const hierarchyCount = links.filter((l) => l.kind === "hierarchy").length;

  return (
    <div className="graph-overlay" onClick={onClose}>
      <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
        <div className="graph-header">
          <span className="graph-title">
            Graph View — {nodes.length} páginas · {wikilinkCount} wikilink{wikilinkCount !== 1 ? "s" : ""} · {hierarchyCount} hierarquia{hierarchyCount !== 1 ? "s" : ""}
          </span>
          <button className="fc-close" onClick={onClose}><X size={14} /></button>
        </div>
        <svg ref={svgRef} className="graph-svg" />
        <div className="graph-legend">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <span key={type} className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: color }} />
              {type}
            </span>
          ))}
          <span className="graph-legend-item">
            <span style={{ display:"inline-block", width:16, borderTop:"1.5px solid rgba(148,128,245,0.7)", verticalAlign:"middle", marginRight:4 }} />
            wikilink
          </span>
          <span className="graph-legend-item">
            <span style={{ display:"inline-block", width:16, borderTop:"1px dashed rgba(100,116,139,0.7)", verticalAlign:"middle", marginRight:4 }} />
            hierarquia
          </span>
          {links.length === 0 && (
            <span className="graph-no-links">
              Sem conexões — use <code>[[título]]</code> para wikilinks ou organize páginas como subpáginas
            </span>
          )}
          <span className="graph-hint">Arraste · Scroll zoom · Clique abre página</span>
        </div>
      </div>
    </div>
  );
}
