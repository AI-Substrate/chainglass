// @chainglass/workgraph entry point
// Exports all workgraph interfaces, fakes, types, schemas, errors, and container factories

// ============================================
// Interfaces
// ============================================
export type {
  // WorkUnit types
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
  // WorkGraph types
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
  // WorkNode types
  IWorkNodeService,
  CanRunResult,
  MarkReadyResult,
  StartResult,
  EndResult,
  GetInputDataResult,
  SaveOutputDataResult,
  ClearOptions,
  ClearResult,
  BlockingNode,
  InputDataValue,
} from './interfaces/index.js';

// ============================================
// Schemas
// ============================================
export {
  // WorkUnit schemas
  IOTypeSchema,
  DataTypeSchema,
  IODeclarationSchema,
  AgentConfigSchema,
  CodeConfigSchema,
  UserInputOptionSchema,
  UserInputConfigSchema,
  AgentUnitSchema,
  CodeUnitSchema,
  UserInputUnitSchema,
  WorkUnitSchema,
  WORK_UNIT_JSON_SCHEMA,
  // WorkGraph schemas
  GraphEdgeSchema,
  WorkGraphDefinitionSchema,
  GraphStatusSchema,
  StoredNodeStatusSchema,
  NodeStateSchema,
  WorkGraphStateSchema,
  WORK_GRAPH_DEFINITION_JSON_SCHEMA,
  WORK_GRAPH_STATE_JSON_SCHEMA,
  // WorkNode schemas
  InputMappingSchema,
  WorkNodeConfigSchema,
  QuestionOptionSchema,
  AnswerSchema,
  QuestionSchema,
  HandoverErrorSchema,
  HandoverSchema,
  WorkNodeDataSchema,
  WORK_NODE_CONFIG_JSON_SCHEMA,
  WORK_NODE_DATA_JSON_SCHEMA,
} from './schemas/index.js';

export type {
  IOType,
  DataType,
  IODeclaration,
  AgentConfigType,
  CodeConfigType,
  UserInputOptionType,
  UserInputConfigType,
  AgentUnitType,
  CodeUnitType,
  UserInputUnitType,
  WorkUnitType,
  GraphEdgeType,
  WorkGraphDefinitionType,
  GraphStatusType,
  StoredNodeStatusType,
  NodeStateType,
  WorkGraphStateType,
  InputMappingType,
  WorkNodeConfigType,
  QuestionOptionType,
  AnswerType,
  QuestionType,
  HandoverErrorType,
  HandoverType,
  WorkNodeDataType,
} from './schemas/index.js';

// ============================================
// Errors
// ============================================
export {
  WORKGRAPH_ERROR_CODES,
  graphNotFoundError,
  cannotRemoveWithDependentsError,
  missingRequiredInputsError,
  invalidGraphSlugError,
  graphAlreadyExistsError,
  nodeNotFoundError,
  cycleDetectedError,
  cannotExecuteBlockedError,
  unitNotFoundError,
  invalidUnitSlugError,
  unitAlreadyExistsError,
  typeMismatchError,
  yamlParseError,
  schemaValidationError,
  fileNotFoundError,
  errors,
} from './errors/index.js';

export type { WorkGraphErrorCode } from './errors/index.js';

// ============================================
// Container
// ============================================
export {
  createWorkgraphProductionContainer,
  createWorkgraphTestContainer,
  getFakeWorkUnitService,
  getFakeWorkGraphService,
  getFakeWorkNodeService,
} from './container.js';

export type { TestContainerOptions } from './container.js';

// ============================================
// Fakes (re-export for convenience)
// ============================================
export {
  FakeWorkUnitService,
  FakeWorkGraphService,
  FakeWorkNodeService,
} from './fakes/index.js';

export type {
  UnitListCall,
  UnitLoadCall,
  UnitCreateCall,
  UnitValidateCall,
  GraphCreateCall,
  GraphLoadCall,
  GraphShowCall,
  GraphStatusCall,
  AddNodeAfterCall,
  RemoveNodeCall,
  CanRunCall,
  MarkReadyCall,
  StartCall,
  EndCall,
  GetInputDataCall,
  SaveOutputDataCall,
  ClearCall,
} from './fakes/index.js';

// ============================================
// Services (real implementations)
// ============================================
export {
  detectCycle,
  generateNodeId,
  WorkGraphService,
  WorkUnitService,
  WorkNodeService,
} from './services/index.js';

export type { CycleDetectionResult } from './services/index.js';
