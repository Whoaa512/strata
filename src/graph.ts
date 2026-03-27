export type EntityKind = "function" | "class" | "module" | "file";

export type EdgeKind =
  | "calls"
  | "contains"
  | "imports"
  | "exports"
  | "co_changes_with";

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  metrics: Record<string, number>;
}

export interface Edge {
  source: string;
  target: string;
  kind: EdgeKind;
  weight: number;
}

export class CodeGraph {
  private entities = new Map<string, Entity>();
  private outEdges = new Map<string, Edge[]>();
  private inEdges = new Map<string, Edge[]>();

  addEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
    if (!this.outEdges.has(entity.id)) this.outEdges.set(entity.id, []);
    if (!this.inEdges.has(entity.id)) this.inEdges.set(entity.id, []);
  }

  addEdge(edge: Edge): void {
    const out = this.outEdges.get(edge.source);
    if (out) out.push(edge);
    else this.outEdges.set(edge.source, [edge]);

    const inc = this.inEdges.get(edge.target);
    if (inc) inc.push(edge);
    else this.inEdges.set(edge.target, [edge]);
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  allEntities(): Entity[] {
    return [...this.entities.values()];
  }

  allEdges(): Edge[] {
    const edges: Edge[] = [];
    for (const list of this.outEdges.values()) {
      edges.push(...list);
    }
    return edges;
  }

  outgoing(id: string, kind?: EdgeKind): Edge[] {
    const edges = this.outEdges.get(id) ?? [];
    if (!kind) return edges;
    return edges.filter((e) => e.kind === kind);
  }

  incoming(id: string, kind?: EdgeKind): Edge[] {
    const edges = this.inEdges.get(id) ?? [];
    if (!kind) return edges;
    return edges.filter((e) => e.kind === kind);
  }

  fanOut(id: string): number {
    return this.outgoing(id, "calls").length;
  }

  fanIn(id: string): number {
    return this.incoming(id, "calls").length;
  }

  forwardSlice(id: string, edgeKind: EdgeKind = "calls"): Set<string> {
    const visited = new Set<string>();
    const queue = [id];

    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of this.outgoing(current, edgeKind)) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }

    visited.delete(id);
    return visited;
  }

  backwardSlice(id: string, edgeKind: EdgeKind = "calls"): Set<string> {
    const visited = new Set<string>();
    const queue = [id];

    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of this.incoming(current, edgeKind)) {
        if (!visited.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }

    visited.delete(id);
    return visited;
  }

  entitiesByKind(kind: EntityKind): Entity[] {
    return this.allEntities().filter((e) => e.kind === kind);
  }

  entitiesInFile(filePath: string): Entity[] {
    return this.allEntities().filter((e) => e.filePath === filePath);
  }

  size(): { entities: number; edges: number } {
    return { entities: this.entities.size, edges: this.allEdges().length };
  }
}
