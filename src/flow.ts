import type { Entity, StrataDoc } from "./schema";

export type FlowNodeRole = "center" | "caller" | "callee" | "implicit";
export type FlowEdgeType = "call" | "temporal";

export interface FlowNode {
  id: string;
  name: string;
  filePath: string;
  kind: Entity["kind"] | "file";
  roles: FlowNodeRole[];
  safetyRating?: "green" | "yellow" | "red";
  rippleScore?: number;
  contextCost?: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  type: FlowEdgeType;
  confidence: number;
}

export interface FlowNeighborhood {
  centerId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  truncated: boolean;
}

export interface FlowOptions {
  depth?: number;
  maxNodes?: number;
  includeTemporal?: boolean;
}

const DEFAULT_MAX_NODES = 40;

export function buildFlowNeighborhood(
  doc: StrataDoc,
  centerId: string,
  options: FlowOptions = {},
): FlowNeighborhood {
  const depth = options.depth ?? 1;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const includeTemporal = options.includeTemporal ?? true;

  const entityById = new Map(doc.entities.map(e => [e.id, e]));
  const center = entityById.get(centerId);
  if (!center) return { centerId, nodes: [], edges: [], truncated: false };

  const riskByEntity = new Map(doc.agentRisk.map(r => [r.entityId, r]));
  const rippleByEntity = new Map(doc.changeRipple.map(r => [r.entityId, r]));
  const entitiesByFile = groupEntitiesByFile(doc.entities);
  const nodes = new Map<string, FlowNode>();
  const edges = new Map<string, FlowEdge>();

  addEntityNode(nodes, center, "center", riskByEntity, rippleByEntity);
  walkStaticEdges(doc, centerId, depth, nodes, edges, entityById, riskByEntity, rippleByEntity, maxNodes);
  if (includeTemporal) {
    addTemporalEdges(center, nodes, edges, entitiesByFile, riskByEntity, rippleByEntity, doc.changeRipple, maxNodes);
  }

  const nodeList = Array.from(nodes.values()).slice(0, maxNodes);
  const kept = new Set(nodeList.map(n => n.id));
  const edgeList = Array.from(edges.values()).filter(e => kept.has(e.from) && kept.has(e.to));
  const truncated = nodes.size > nodeList.length;

  return { centerId, nodes: nodeList, edges: edgeList, truncated };
}

function walkStaticEdges(
  doc: StrataDoc,
  centerId: string,
  depth: number,
  nodes: Map<string, FlowNode>,
  edges: Map<string, FlowEdge>,
  entityById: Map<string, Entity>,
  riskByEntity: Map<string, StrataDoc["agentRisk"][number]>,
  rippleByEntity: Map<string, StrataDoc["changeRipple"][number]>,
  maxNodes: number,
) {
  const queue: Array<{ id: string; distance: number }> = [{ id: centerId, distance: 0 }];
  const seen = new Set<string>();

  while (queue.length > 0 && nodes.size <= maxNodes) {
    const current = queue.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    if (current.distance >= depth) continue;

    for (const edge of doc.callGraph) {
      if (edge.caller !== current.id && edge.callee !== current.id) continue;

      const neighborId = edge.caller === current.id ? edge.callee : edge.caller;
      const neighbor = entityById.get(neighborId);
      if (!neighbor) continue;

      const role: FlowNodeRole = edge.caller === current.id ? "callee" : "caller";
      addEntityNode(nodes, neighbor, role, riskByEntity, rippleByEntity);
      addEdge(edges, { from: edge.caller, to: edge.callee, type: "call", confidence: 1 });

      if (!seen.has(neighborId) && nodes.size < maxNodes) {
        queue.push({ id: neighborId, distance: current.distance + 1 });
      }
    }
  }
}

function addTemporalEdges(
  center: Entity,
  nodes: Map<string, FlowNode>,
  edges: Map<string, FlowEdge>,
  entitiesByFile: Map<string, Entity[]>,
  riskByEntity: Map<string, StrataDoc["agentRisk"][number]>,
  rippleByEntity: Map<string, StrataDoc["changeRipple"][number]>,
  ripples: StrataDoc["changeRipple"],
  maxNodes: number,
) {
  const ripple = ripples.find(r => r.entityId === center.id);
  if (!ripple) return;

  for (const coupling of ripple.implicitCouplings) {
    if (nodes.size >= maxNodes) return;

    const target = (entitiesByFile.get(coupling.filePath) ?? [])[0];
    const toId = target?.id ?? `file:${coupling.filePath}`;

    if (target) {
      addEntityNode(nodes, target, "implicit", riskByEntity, rippleByEntity);
    } else {
      addFileNode(nodes, coupling.filePath, "implicit");
    }

    addEdge(edges, { from: center.id, to: toId, type: "temporal", confidence: coupling.cochangeRate });
  }
}

function addEntityNode(
  nodes: Map<string, FlowNode>,
  entity: Entity,
  role: FlowNodeRole,
  riskByEntity: Map<string, StrataDoc["agentRisk"][number]>,
  rippleByEntity: Map<string, StrataDoc["changeRipple"][number]>,
) {
  const risk = riskByEntity.get(entity.id);
  const ripple = rippleByEntity.get(entity.id);
  const existing = nodes.get(entity.id);
  if (existing) {
    addRole(existing, role);
    return;
  }

  nodes.set(entity.id, {
    id: entity.id,
    name: entity.name,
    filePath: entity.filePath,
    kind: entity.kind,
    roles: [role],
    safetyRating: risk?.safetyRating,
    rippleScore: ripple?.rippleScore,
    contextCost: risk?.contextCost,
  });
}

function addFileNode(nodes: Map<string, FlowNode>, filePath: string, role: FlowNodeRole) {
  const id = `file:${filePath}`;
  const existing = nodes.get(id);
  if (existing) {
    addRole(existing, role);
    return;
  }

  nodes.set(id, {
    id,
    name: filePath.split("/").pop() ?? filePath,
    filePath,
    kind: "file",
    roles: [role],
  });
}

function addRole(node: FlowNode, role: FlowNodeRole) {
  if (!node.roles.includes(role)) node.roles.push(role);
}

function addEdge(edges: Map<string, FlowEdge>, edge: FlowEdge) {
  edges.set(`${edge.from}->${edge.to}:${edge.type}`, edge);
}

function groupEntitiesByFile(entities: Entity[]): Map<string, Entity[]> {
  const result = new Map<string, Entity[]>();
  for (const entity of entities) {
    const list = result.get(entity.filePath) ?? [];
    list.push(entity);
    result.set(entity.filePath, list);
  }
  return result;
}
