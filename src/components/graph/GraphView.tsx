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
}

function extractWikilinks(content: string | null): string[] {
  if (!content) return [];
  const results: string[] = [];
  // texto literal [[título]] (formato antigo)
  const textRe = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = textRe.exec(content)) !== null) results.push(m[1].toLowerCase());
  // wikilinks do BlockNote: { type:"wikilink", props:{ pageTitle } }
  try {
    walkBlocks(JSON.parse(content), results);
  } catch { /* não é JSON */ }
  return [...new Set(results)]; // deduplicar
}

function walkBlocks(blocks: unknown[], acc: string[]) {
  if (!Array.isArray(blocks)) return;
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as Record<string, unknown>;
    if (Array.isArray(block.content)) {
      for (const inline of block.content) {
        const il = inline as Record<string, unknown>;
        if (il.type === "wikilink") {
          const props = il.props as Record<string, unknown> | undefined;
          const title = props?.pageTitle ?? il.pageTitle;
          if (typeof title === "string" && title.trim()) {
            acc.push(title.trim().toLowerCase());
          }
        }
      }
    }
    if (Array.isArray(block.children)) walkBlocks(block.children, acc);
  }
}

const NODE_COLORS: Record<Page["type"], string> = {
  document: "#9480f5",
  daily:    "#818cf8",
  canvas:   "#f59e0b",
  folder:   "#64748b",
};

function nodeRadius(degree: number) {
  return 7 + Math.min(degree * 1.5, 10);
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

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

  // Refs estáveis para callbacks — nunca causam re-run do useEffect
  const onSelectRef = useRef(onSelectPage);
  const onCloseRef  = useRef(onClose);
  useLayoutEffect(() => {
    onSelectRef.current = onSelectPage;
    onCloseRef.current  = onClose;
  });

  const { nodes, links } = useMemo(() => {
    const titleToId  = new Map(pages.map((p) => [p.title.trim().toLowerCase(), p.id]));
    const degreeMap  = new Map<string, number>();
    const seen       = new Set<string>();
    const links: GraphLink[] = [];

    for (const page of pages) {
      const refs = extractWikilinks(page.content);
      for (const ref of refs) {
        const targetId = titleToId.get(ref);
        if (!targetId || targetId === page.id) continue;
        const key = `${page.id}→${targetId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ source: page.id, target: targetId });
        degreeMap.set(page.id,   (degreeMap.get(page.id)   ?? 0) + 1);
        degreeMap.set(targetId,  (degreeMap.get(targetId)  ?? 0) + 1);
      }
    }

    const nodes: GraphNode[] = pages.map((p) => ({
      id:     p.id,
      title:  p.title,
      type:   p.type,
      degree: degreeMap.get(p.id) ?? 0,
    }));

    return { nodes, links };
  }, [pages]);

  // ── Simulação D3 — só recria quando os dados mudam, NÃO quando callbacks mudam ──
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const W = rect.width  || 800;
    const H = rect.height || 560;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).attr("width", W).attr("height", H);

    // Seta direcional
    svg.append("defs").append("marker")
      .attr("id", "gv-arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 16)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "rgba(148,128,245,0.4)");

    const container = svg.append("g").attr("class", "graph-root");

    // Zoom/pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (ev) => container.attr("transform", ev.transform));
    svg.call(zoom);
    // Centraliza o grafo
    svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2));

    // Copia dos dados para a simulação
    const simNodes: GraphNode[] = nodes.map((n) => ({ ...n }));
    const simLinks: GraphLink[] = links.map((l) => ({ source: l.source as string, target: l.target as string }));

    const simulation = d3.forceSimulation<GraphNode>(simNodes)
      .force("link",      d3.forceLink<GraphNode, GraphLink>(simLinks)
                            .id((d) => d.id)
                            .distance(100)
                            .strength(0.5))
      .force("charge",    d3.forceManyBody<GraphNode>().strength(-250))
      .force("center",    d3.forceCenter(0, 0))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d.degree) + 6));

    // Arestas
    const linkSel = container.append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", "rgba(148,128,245,0.35)")
      .attr("stroke-width", 1.2)
      .attr("marker-end", "url(#gv-arrow)");

    // Nós
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

    nodeG.append("text")
      .text((d) => truncate(d.title, 20))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => nodeRadius(d.degree) + 13)
      .attr("font-size", 10)
      .attr("fill", "var(--sidebar-text)")
      .attr("pointer-events", "none");

    // Tooltip
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

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [nodes, links]); // ← SEM onSelectPage/onClose — usam refs estáveis

  // ── Atualiza destaque do nó selecionado sem recriar a simulação ──
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGCircleElement, GraphNode>(".graph-node circle")
      .attr("stroke",       (d) => d.id === selectedPageId ? "#fff" : "transparent")
      .attr("stroke-width", 2);
  }, [selectedPageId, nodes]); // nodes garante que o efeito roda após o SVG estar pronto

  return (
    <div className="graph-overlay" onClick={onClose}>
      <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
        <div className="graph-header">
          <span className="graph-title">
            Graph View — {nodes.length} páginas · {links.length} conexão{links.length !== 1 ? "ões" : ""}
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
          {links.length === 0 && (
            <span className="graph-no-links">
              Sem conexões — escreva <code>[[título]]</code> em qualquer página para criar um link
            </span>
          )}
          <span className="graph-hint">Arraste · Scroll zoom · Clique abre página</span>
        </div>
      </div>
    </div>
  );
}
