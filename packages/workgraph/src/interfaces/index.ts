// Interfaces barrel export
// Per Invariants: Use `export type` for interfaces and types

// IWorkUnitService
export type {
  IWorkUnitService,
  WorkUnitSummary,
  UnitListResult,
  UnitLoadResult,
  UnitCreateResult,
  UnitValidateResult,
  ValidationIssue,
  InputDeclaration,
  OutputDeclaration,
  AgentConfig,
  CodeConfig,
  UserInputConfig,
  UserInputOption,
  WorkUnit,
} from './workunit-service.interface.js';

// IWorkGraphService
export type {
  IWorkGraphService,
  GraphStatus,
  NodeStatus,
  GraphEdge,
  InputMapping,
  NodeSummary,
  GraphCreateResult,
  GraphLoadResult,
  GraphShowResult,
  GraphStatusResult,
  AddNodeResult,
  RemoveNodeResult,
  AddNodeOptions,
  RemoveNodeOptions,
  WorkGraphDefinition,
  ShowTreeNode,
  NodeStatusEntry,
} from './workgraph-service.interface.js';

// IWorkNodeService
export type {
  IWorkNodeService,
  CanRunResult,
  StartResult,
  EndResult,
  GetInputDataResult,
  SaveOutputDataResult,
  BlockingNode,
  InputDataValue,
} from './worknode-service.interface.js';
