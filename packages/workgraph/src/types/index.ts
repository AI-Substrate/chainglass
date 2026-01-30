/**
 * Types barrel export.
 *
 * Re-exports all types from interfaces and schemas for convenient access.
 * All result types extend BaseResult from @chainglass/shared (per Critical Discovery 02).
 */

// Re-export interface result types
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
  StartResult,
  EndResult,
  GetInputDataResult,
  SaveOutputDataResult,
  BlockingNode,
  InputDataValue,
} from '../interfaces/index.js';

// Re-export schema types
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
} from '../schemas/index.js';
