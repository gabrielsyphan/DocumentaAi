import { useEffect, useRef, useMemo } from "react";
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
  const textRe = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = textRe.exec(content)) !== null) results.push(m[1].toLowerCase());
  try {
    const blocks = JSON.parse(content);
    walkBlocks(blocks, results);
  } catch { /* not JSON */ }
  return results;
}

function walkBlocks(blocks: unknown[], acc: string[]) {
  if (!Array.isArray(blocks)) return;
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as Record<string, unknown>;
    if (Array.isArray(block.content)) {
      for (const inline of block.content) {
        const il = inline as Record<string, unknown>;
        // BlockNote serializa wikilinks como { type: "wikilink", props: { pageTitle } }
        if (il.type === "wikilink") {
          const props = il.props as Record<string, unknown> | undefined;
          const title = props?.pageTitle ?? il.pageTitle; // compatibilidade retroativa
          if (typeof title === "string" && title) acc.push(title.toLowerCase());
        }
      }
    }
    if (Array.isArray(block.children)) walkBlocks(block.children, acc);
  }
}

const NODE_COLORS: Record<Page["type"], string> = {
  document: "#9480f5",
  daily: "#818cf8",
  canvas: "#f59e0b",
  folder: "#64748b",
};

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

  const { nodes, links } = useMemo(() => {
    const titleToId = new Map(pages.map((p) => [p.title.toLowerCase(), p.id]));
    const degreeMap = new Map<string, number>();

    const links: GraphLink[] = [];
    for (const page of pages) {
      const refs = extractWikilinks(page.content);
      for (const ref of refs) {
        const targetId = titleToId.get(ref);
        if (targetId && targetId !== page.id) {
          links.push({ source: page.id, target: targetId });
          degreeMap.set(page.id, (degreeMap.get(page.id) ?? 0) + 1);
          degreeMap.set(targetId, (degreeMap.get(targetId) ?? 0) + 1);
        }
      }
    }

    const nodes: GraphNode[] = pages.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      degree: degreeMap.get(p.id) ?? 0,
    }));

    return { nodes, links };
  }, [pages]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const W = rect.width || 800;
    const H = rect.height || 560;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el)
      .attr("width", W)
      .attr("height", H);

    const container = svg.append("g").attr("class", "graph-root");

    // Zoom/pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => container.attr("transform", event.transform));
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2));

    // Arrows
    svg.append("defs").append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 14)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "rgba(148,128,245,0.5)");

    const simNodes: GraphNode[] = nodes.map((n) => ({ ...n }));
    const simLinks: GraphLink[] = links.map((l) => ({ ...l }));

    const simulation = d3.forceSimulation<GraphNode>(simNodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(simLinks).id((d) => d.id).distance(90).strength(0.6))
      .force("charge", d3.forceManyBody<GraphNode>().strength(-220))
      .force("center", d3.forceCenter(0, 0))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => radius(d) + 4));

    const link = container.append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", "rgba(148,128,245,0.3)")
      .attr("stroke-width", 1)
      .attr("marker-end", "url(#arrow)");

    const nodeG = container.append("g")
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .attr("class", "graph-node")
      .style("cursor", "pointer")
      .on("click", (_event, d) => { onSelectPage(d.id); onClose(); })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }) as any);

    nodeG.append("circle")
      .attr("r", (d) => radius(d))
      .attr("fill", (d) => NODE_COLORS[d.type] ?? "#9480f5")
      .attr("stroke", (d) => d.id === selectedPageId ? "#fff" : "transparent")
      .attr("stroke-width", 2)
      .attr("opacity", 0.9);

    nodeG.append("text")
      .text((d) => truncate(d.title, 18))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => radius(d) + 12)
      .attr("font-size", 10)
      .attr("fill", "var(--sidebar-text)")
      .attr("pointer-events", "none");

    // Tooltip
    const tooltip = d3.select("body").append("div").attr("class", "graph-tooltip");

    nodeG
      .on("mouseenter", (event, d) => {
        tooltip
          .style("display", "block")
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`)
          .text(d.title);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", `${event.pageX + 10}px`).style("top", `${event.pageY - 28}px`);
      })
      .on("mouseleave", () => tooltip.style("display", "none"));

    simulation.on("tick", () => {
      link
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
  }, [nodes, links, selectedPageId, onSelectPage, onClose]);

  return (
    <div className="graph-overlay" onClick={onClose}>
      <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
        <div className="graph-header">
          <span className="graph-title">Graph View — {nodes.length} páginas · {links.length} conexões</span>
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
              Sem conexões ainda — escreva <code>[[título da página]]</code> em qualquer página para criar um link
            </span>
          )}
          <span className="graph-hint">Arraste · Scroll zoom · Clique abre página</span>
        </div>
      </div>
    </div>
  );
}

function radius(d: GraphNode) {
  return 7 + Math.min(d.degree * 1.5, 10);
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
