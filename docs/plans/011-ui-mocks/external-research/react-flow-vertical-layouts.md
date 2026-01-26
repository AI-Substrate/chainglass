# React Flow Vertical Layout Best Practices: Comprehensive Implementation Guide

This research report provides a detailed examination of implementing vertical top-to-bottom layouts in React Flow v12.10.0, including configuration strategies, handle positioning techniques, auto-layout integration, performance optimization, and practical implementation patterns for workflow execution UIs. The report synthesizes technical documentation, code examples, and architectural considerations to establish best practices for building scalable vertical flow diagrams with proper handle management, edge routing, and performance characteristics suitable for 5-20 node workflows in modern React applications.

## Understanding React Flow V12 Architecture for Vertical Layout Implementation

React Flow v12 represents a significant evolution in the library's API, particularly in how it handles node positioning and dimension management.[4][22] The architecture shift from React Flow 11 to v12 introduced critical changes that directly impact vertical layout implementations. Most importantly, the library now distinguishes between `node.width`/`node.height` (which are used as inline styles to specify fixed dimensions) and `node.measured.width`/`node.measured.height` (which store the actual measured dimensions after React Flow has calculated them).[4][22] This architectural change is fundamental to understanding how to properly configure vertical layouts, as dimension information must be correctly sourced when working with layout libraries.

The core concept underlying vertical layout in React Flow involves understanding the relationship between position coordinates, handle placement, and viewport orientation. In traditional horizontal flows, nodes progress from left to right, with handles typically positioned on the left (target) and right (source) sides. Vertical flows invert this paradigm—nodes progress from top to bottom, necessitating a complete reconsideration of handle positioning and edge routing strategies.[2][16] React Flow's flexibility allows developers to define custom node types with arbitrary handle configurations, making vertical layout implementation a matter of deliberate configuration rather than a library limitation.

The architectural foundation of React Flow v12 also includes enhanced state management through the internal store system, which tracks node positions, dimensions, edges, and viewport state. When implementing vertical layouts, developers must work within this state management framework, particularly when using external layout libraries like Dagre or ELK that calculate positions asynchronously and require dimension information from the measured node properties.[1][3] Understanding this interaction between React Flow's internal state and external layout calculations is essential for implementing robust vertical layout solutions.

## Core Configuration for Top-to-Bottom Flow Orientation

Implementing a top-to-bottom vertical layout in React Flow requires careful configuration of several interconnected properties at both the node level and the edge level. The fundamental approach involves setting `sourcePosition` and `targetPosition` props on nodes to orient the connection points appropriately for vertical flow.[16][31] For a top-to-bottom layout, target handles should be positioned at the top of nodes (serving as entry points for incoming connections), while source handles should be positioned at the bottom (serving as exit points for outgoing connections).[16][31]

The basic configuration pattern for a single node in a vertical layout appears as follows:

```typescript
const verticalNodes = [
  {
    id: 'phase-1',
    type: 'default',
    data: { label: 'Workflow Start' },
    position: { x: 0, y: 0 },
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
  },
  {
    id: 'phase-2',
    type: 'default',
    data: { label: 'Processing Phase' },
    position: { x: 0, y: 150 },
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
  },
];
```

This configuration establishes the foundational orientation for vertical flow. The `targetPosition` property tells React Flow where incoming edge connections should visually attach to the node, while `sourcePosition` indicates where outgoing edges should originate. By setting both to Top and Bottom respectively, the library understands that the flow direction is vertical.[16][31] The consistency of these properties across all nodes is critical—mixing position orientations creates visual confusion and breaks the logical flow representation.

However, this base configuration alone is insufficient for complex vertical workflows. When nodes have multiple handles (which is common in workflow UIs where different types of connections might branch from different points), developers must implement more sophisticated positioning logic. For instance, a workflow node might have multiple source handles for success, failure, and timeout paths. In such cases, the `sourcePosition` property represents the default position for connections, but individual handles must be precisely positioned using their own position properties and CSS styling.[2][6][18]

The positioning configuration must also account for the viewport coordinate system. In React Flow, the canvas origin (0, 0) typically appears in the upper-left portion of the viewport. For vertical layouts, Y-coordinates increase downward, meaning subsequent nodes in the workflow should have progressively larger Y values. This is opposite to some graphing libraries where Y coordinates increase upward. Understanding this coordinate system prevents confusion when manually positioning nodes or calculating positions dynamically.

## Handle Positioning and Connection Point Management

Handles represent the connection points through which edges attach to nodes, and their positioning is absolutely critical for vertical layout aesthetics and usability.[2][15][18] React Flow provides a `Position` enum with four values: `Top`, `Bottom`, `Left`, and `Right`.[34] For vertical layouts, the primary handles should use `Top` and `Bottom` positions, completely avoiding `Left` and `Right` positions that are designed for horizontal flows.[2][6][18]

The recommended handle configuration for a vertically-oriented custom node component appears as follows:

```typescript
import { Handle, Position } from '@xyflow/react';

export const VerticalPhaseNode = ({ data }) => {
  return (
    <div className="vertical-phase-node">
      <Handle 
        type="target" 
        position={Position.Top}
        isConnectable={true}
      />
      <div className="node-content">
        {data.label}
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom}
        isConnectable={true}
      />
    </div>
  );
};
```

This pattern establishes a single input point at the top and a single output point at the bottom, matching the vertical flow direction. However, many practical workflow implementations require multiple source handles to represent different connection types or outcomes. When implementing multiple handles of the same type, each handle must have a unique `id` property, and edges must reference these IDs through `sourceHandle` and `targetHandle` properties.[6][18][37]

A multi-handle vertical implementation might look like this:

```typescript
export const ComplexWorkflowNode = ({ data }) => {
  return (
    <div className="complex-workflow-node">
      <Handle 
        type="target" 
        position={Position.Top}
      />
      <div className="node-content">
        {data.label}
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom}
        id="success"
      />
      <Handle 
        type="source" 
        position={Position.Bottom}
        id="error"
        style={{ top: 'auto', bottom: '20px' }}
      />
    </div>
  );
};
```

In this configuration, multiple source handles are both positioned at the bottom but distinguished through their unique IDs and adjusted through inline styles to prevent them from overlapping. The `style` property allows fine-tuning of handle positions within their defined position boundary.[2][6] This approach prevents edge overlap issues that commonly arise in vertical layouts with multiple connections from a single node.

When positioning multiple handles on the same side, developers must exercise caution to ensure they're distributed clearly and don't create visual ambiguity. The documentation specifically warns that handle visibility and positioning must account for React Flow's internal dimension calculations—using `display: none` to hide handles breaks the system, as React Flow needs to calculate their dimensions, whereas `visibility: hidden` or `opacity: 0` preserve the dimensional information while hiding the visual element.[18][37]

For even more complex scenarios with many handles, custom positioning through wrapper components and CSS absolute positioning can provide greater control. The key principle is that each handle must remain as a child of the Handle component to maintain proper integration with React Flow's connection system.[2][6][18] The library provides a utility class `nodrag` that can be applied to interactive elements within nodes to disable node dragging when interacting with those elements, which becomes important when handles or other interactive components are involved.[40][41]

## Edge Routing and Visual Flow Management

Edge routing determines how connection lines are rendered between nodes, and vertical layouts present specific challenges for achieving clean, non-overlapping edges.[9][12][23] React Flow provides four built-in edge types: `default` (bezier curves), `straight`, `step`, and `smoothstep`.[9][12] Each has different visual characteristics and performance implications for vertical layouts.

The `straight` edge type renders direct lines between connection points, which in vertical layouts means vertical or near-vertical lines. While simple, this approach offers minimal visual appeal and can make complex graphs difficult to follow.[9][12] The `step` edge type creates right-angle connections, which in a vertical layout would consist of a vertical segment followed by a horizontal segment. The `smoothstep` variant rounds the angles, providing a more polished appearance while maintaining clarity.[9][12] For most workflow UIs, `smoothstep` represents an optimal balance between aesthetics and clarity.

```typescript
const verticalEdges = [
  {
    id: 'edge-1-2',
    source: 'phase-1',
    target: 'phase-2',
    type: 'smoothstep',
    animated: true,
  },
];
```

The `default` (bezier) edge type renders smooth curves that flow naturally but can create overlapping visual complexity in vertical layouts, particularly when multiple edges originate from or converge on the same node. Bezier edges work better when nodes are distributed horizontally, as they provide a natural flowing appearance in that context. For vertical layouts, the step-based edge types generally provide clearer visual communication.

However, edge overlap remains a persistent challenge in React Flow, particularly when a single node has multiple outgoing connections to nodes at similar vertical positions.[23][45] This is a known architectural limitation—the library does not include built-in smart edge routing that automatically prevents overlapping.[23][45] When edges from a single node connect to multiple target nodes at similar Y-coordinates, they will overlap visually, obscuring which edge connects to which node. Several approaches can mitigate this issue.

The first and most effective approach involves using multiple handles positioned at different locations on the source node.[23][45] By connecting different source handles to different target nodes, edges naturally separate, avoiding the overlap problem entirely. This approach is particularly effective because it leverages React Flow's core architecture rather than fighting against it. The second approach involves adjusting the vertical positioning of target nodes to create natural separation, ensuring that edges converge from different angles rather than overlapping vertically. This requires careful planning of node Y-coordinates.

Custom edge implementations using SVG paths and manual routing can provide additional control, though this significantly increases complexity and is generally reserved for specialized use cases.[23][45] Some developers have implemented or used third-party libraries like `react-flow-smart-edge` for intelligent edge routing, though compatibility with React Flow v12 remains limited.[23][45] For most workflow implementations with 5-20 nodes, the multiple-handle approach combined with careful Y-coordinate planning provides sufficient edge clarity without requiring custom edge rendering.

## Auto-Layout Integration: Dagre and ELK Implementation Strategies

Manual positioning of nodes in vertical layouts quickly becomes impractical as graph complexity increases. Auto-layout libraries handle this challenge by calculating optimal node positions based on the graph structure. Dagre and ELK represent the two primary options for React Flow integration, each with distinct characteristics.[5][13][27][29]

Dagre is a hierarchical graph layout library particularly well-suited for directed acyclic graphs (DAGs), making it ideal for workflow pipelines.[5][13][27][29] It operates synchronously, calculating layouts quickly and providing configurable options for node spacing, layer spacing, and alignment.[5][13][27][29] Dagre is recommended as the first choice for tree-like workflow structures, which encompasses most CI/CD and workflow execution visualizations.[5][13][27][29]

The integration of Dagre with React Flow v12 requires particular attention to dimension handling. In React Flow v12, nodes must be measured before their dimensions are available through `node.measured.width` and `node.measured.height`.[4][22] When using Dagre, developers typically hardcode node dimensions or measure them beforehand, as Dagre requires dimension information to calculate optimal spacing:[1][32]

```typescript
import dagre from '@dagrejs/dagre';

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction });

  // For v12, use measured dimensions if available
  const nodeWidth = 200;
  const nodeHeight = 100;

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: node.measured?.width || nodeWidth,
      height: node.measured?.height || nodeHeight 
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - (node.measured?.width || nodeWidth) / 2,
        y: nodeWithPosition.y - (node.measured?.height || nodeHeight) / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
};
```

This implementation automatically sets handle positions based on the layout direction, ensuring consistency. The `rankdir` property set to 'TB' (top-to-bottom) configures Dagre for vertical layout.[32] The critical step involves calculating the offset between Dagre's coordinate system (which uses center-anchored positioning) and React Flow's coordinate system (which uses top-left anchoring), accomplished by subtracting half the node dimensions from the calculated positions.

ELK (Eclipse Layout Kernel) provides more advanced capabilities than Dagre, including better support for edge routing, hierarchical clustering, and complex graph structures. However, this power comes with increased complexity and computational overhead.[5][21][27] ELK operates asynchronously, requiring promise-based handling, and offers extensive configuration options.[5][21][27]

```typescript
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.spacing.nodeNode': '80',
  'elk.direction': 'DOWN',
};

const getLayoutedElements = async (nodes, edges, options = {}) => {
  const graph = {
    id: 'root',
    layoutOptions: { ...elkOptions, ...options },
    children: nodes.map((node) => ({
      ...node,
      width: node.measured?.width || 200,
      height: node.measured?.height || 100,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    })),
    edges: edges,
  };

  const layoutedGraph = await elk.layout(graph);
  
  return {
    nodes: layoutedGraph.children.map((node) => ({
      ...node,
      position: { x: node.x, y: node.y },
    })),
    edges: layoutedGraph.edges,
  };
};
```

For vertical workflow layouts, ELK's hierarchical layout algorithm produces excellent results, particularly when the layout options include direction configuration.[21][27] The `'elk.direction': 'DOWN'` option explicitly configures vertical top-to-bottom layout, and the spacing options control the distance between nodes and layers.

A crucial architectural decision involves determining when to recalculate layout. Static layout (calculated once on initial render) works for stable workflow structures but doesn't adapt when nodes or edges are added dynamically.[32] Dynamic layout requires triggering recalculation whenever the graph structure changes, though this incurs performance costs. The documentation provides an example of implementing dynamic layout in a Pro example that demonstrates handling this through effect hooks and triggering recalculation on graph changes.[36][47]

## Performance Optimization for Vertical Workflows with Multiple Nodes

Performance becomes increasingly critical as vertical workflow diagrams grow in complexity. While 5-20 nodes represents a manageable scale, performance degradation can occur through several mechanisms specific to vertical layouts and React Flow in general.[11][14][46][49]

The most significant performance threat involves unnecessary component re-rendering. Since node movements trigger frequent state updates in React Flow's internal store, components dependent on the full nodes or edges arrays will re-render constantly, even when those specific components' relevant data hasn't changed.[11][14][46][49] This problem intensifies with vertical layouts because layout recalculation often touches all nodes simultaneously, causing widespread re-rendering.

The primary mitigation strategy involves aggressive memoization using `React.memo`.[11][14][46][49] Custom node components should be wrapped in `React.memo` to prevent re-rendering when props haven't changed:

```typescript
const VerticalPhaseNode = memo(({ data, isConnectable }) => {
  return (
    <div className="phase-node">
      <Handle type="target" position={Position.Top} />
      <div className="phase-content">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

VerticalPhaseNode.displayName = 'VerticalPhaseNode';
```

Similarly, callback functions passed to the `<ReactFlow />` component must be memoized using `useCallback` to prevent new function references from triggering re-renders:[11][14][46][49]

```typescript
const onNodesChange = useCallback(
  (changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  },
  []
);

const onEdgesChange = useCallback(
  (changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  },
  []
);
```

Object and array props passed to ReactFlow should be memoized using `useMemo`:[11][14][46][49]

```typescript
const nodeTypes = useMemo(() => ({
  verticalPhase: VerticalPhaseNode,
  complexWorkflow: ComplexWorkflowNode,
}), []);
```

For complex node content (such as workflow status indicators with heavy computations or embedded data grids), wrap the content itself in a separate memoized component:[11][46]:

```typescript
const HeavyNodeContent = memo(() => {
  const { data } = useContext(NodeContext);
  return (
    <div className="complex-content">
      {/* Complex rendering logic */}
    </div>
  );
});

const PhaseNodeWithHeavyContent = memo(({ data }) => {
  return (
    <div className="phase-node">
      <Handle type="target" position={Position.Top} />
      <HeavyNodeContent data={data} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
```

Performance testing reveals that with optimal memoization, diagrams with 20 nodes should maintain 60 FPS on modern hardware even during panning and zooming operations.[11][46] Without memoization, the same diagram might degrade to 2-10 FPS, particularly if nodes contain complex components.

Another performance consideration involves edge types and styling. Complex CSS styles with shadows, gradients, and animations degrade performance more significantly than simple styles.[14][49] For vertical layouts with many nodes, using `smoothstep` edges with `animated: false` provides better performance than `default` (bezier) edges with animation, as the constant re-rendering of animated paths impacts performance.[14][49]

Collapsing nested node hierarchies provides significant performance benefits for deeply nested workflows.[14][49] Rather than rendering all nodes simultaneously, dynamically hiding child nodes when parent nodes are collapsed reduces the total number of rendered elements:

```typescript
const handleNodeClick = useCallback((targetNode) => {
  if (targetNode.data.children) {
    setNodes((prevNodes) =>
      prevNodes.map((node) =>
        targetNode.data.children.includes(node.id)
          ? { ...node, hidden: !node.hidden }
          : node
      )
    );
  }
}, []);
```

## Styling and CSS Considerations for Vertical React Flow Graphs

Visual clarity of vertical workflows depends significantly on thoughtful CSS styling that accounts for the unique challenges of top-to-bottom layout. React Flow v12 provides comprehensive styling capabilities through CSS classes and inline styles, with theming support for both light and dark modes.[19][61]

The base styling foundation should account for handle visibility and positioning in vertical layouts. By default, React Flow positions handles at the center of their specified side. For vertical layouts with multiple handles, this centering often requires override styling to distribute handles evenly:

```css
.react-flow__handle {
  background: #555;
  border: 2px solid white;
  border-radius: 50%;
  width: 12px;
  height: 12px;
}

.react-flow__handle.top {
  top: -6px;
}

.react-flow__handle.bottom {
  bottom: -6px;
}

/* Custom positioning for multiple handles on same side */
.vertical-phase-node .react-flow__handle:nth-of-type(2) {
  position: absolute;
  bottom: 4px;
  left: calc(50% - 6px - 15px);
}

.vertical-phase-node .react-flow__handle:nth-of-type(3) {
  position: absolute;
  bottom: 4px;
  right: calc(50% - 6px - 15px);
}
```

Node container styling should account for the vertical flow direction, typically using wider-than-tall dimensions to accommodate workflow metadata (status, phase name, execution time) without creating visually awkward proportions:[40][43]

```css
.vertical-phase-node {
  background: white;
  border: 2px solid #ddd;
  border-radius: 8px;
  padding: 12px 16px;
  width: 200px;
  min-height: 80px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.vertical-phase-node:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: #999;
}

.vertical-phase-node.selected {
  border-color: #0066cc;
  box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
}

.phase-node__title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  color: #333;
}

.phase-node__details {
  font-size: 12px;
  color: #666;
}
```

The `BaseNode` component from React Flow's UI components registry provides a pre-styled wrapper that implements accessibility best practices and consistent theming:[20][40]. Using this component as a foundation for vertical workflow nodes reduces styling burden:

```typescript
import { 
  BaseNode, 
  BaseNodeHeader, 
  BaseNodeHeaderTitle,
  BaseNodeContent,
  BaseNodeFooter 
} from '@/components/base-node';

export const VerticalWorkflowNode = memo(({ data }) => {
  return (
    <BaseNode className="w-64">
      <BaseNodeHeader className="border-b">
        <Clock className="size-4" />
        <BaseNodeHeaderTitle>{data.phase}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <p className="text-sm text-gray-600">{data.description}</p>
        <div className="mt-2 text-xs">
          <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded">
            {data.status}
          </span>
        </div>
      </BaseNodeContent>
      <BaseNodeFooter>
        <span className="text-xs text-gray-500">
          {data.duration}
        </span>
      </BaseNodeFooter>
    </BaseNode>
  );
});
```

This approach leverages Tailwind CSS for styling consistency with the rest of the application and provides built-in accessibility features.

Handle styling when connecting requires special attention in vertical layouts. React Flow provides automatic `connecting` and `valid` class additions to handles during connection interactions.[18][37] These can be styled to provide visual feedback:

```css
.react-flow__handle.connecting {
  background: #ffc100;
  box-shadow: 0 0 8px rgba(255, 193, 0, 0.5);
}

.react-flow__handle.valid {
  background: #22c55e;
}

.react-flow__handle.invalid {
  background: #ef4444;
}
```

Edge styling for vertical layouts should account for the specific edge type being used. For `smoothstep` edges, styling focuses on stroke properties:

```css
.react-flow__edge-smoothstep path {
  stroke: #999;
  stroke-width: 2;
}

.react-flow__edge-smoothstep.animated path {
  stroke-dasharray: 5;
  animation: dash 0.5s linear infinite;
}

@keyframes dash {
  to {
    stroke-dashoffset: -10;
  }
}

.react-flow__edge.selected path {
  stroke: #0066cc;
  stroke-width: 3;
}
```

Dark mode support in React Flow v12 can be implemented through CSS variables and the `colorMode` prop. Setting `colorMode="dark"` on the ReactFlow component applies the dark class to the wrapper, allowing CSS rules to adjust colors accordingly:[19][61]:

```typescript
<ReactFlow
  nodes={nodes}
  edges={edges}
  colorMode="dark"
  nodeTypes={nodeTypes}
  // ... other props
/>
```

```css
.dark .vertical-phase-node {
  background: #1e1e1e;
  border-color: #444;
  color: #e0e0e0;
}

.dark .vertical-phase-node:hover {
  border-color: #666;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
```

## Custom Node Components Optimized for Vertical Display

Implementing effective custom node components for vertical workflows requires understanding the specific constraints and opportunities presented by top-to-bottom layout. The vertical orientation fundamentally changes how information should be presented within nodes compared to horizontal layouts.

A foundational vertical node component structure should use flex layouts optimized for vertical information flow:

```typescript
import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface VerticalNodeData {
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
  description?: string;
}

export const VerticalNode = memo<NodeProps<VerticalNodeData>>(
  ({ data, selected, isConnectable }) => {
    const statusColors = {
      pending: 'bg-gray-100 text-gray-800',
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };

    return (
      <div
        className={`
          flex flex-col w-56 px-4 py-3 bg-white rounded-lg
          border-2 transition-all
          ${selected ? 'border-blue-500 shadow-lg' : 'border-gray-300 shadow-md'}
        `}
      >
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          className="w-3 h-3"
        />

        <div className="flex-1">
          <h3 className="font-semibold text-sm text-gray-900 mb-1">
            {data.label}
          </h3>
          {data.description && (
            <p className="text-xs text-gray-600 mb-2">
              {data.description}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium px-2 py-1 rounded ${statusColors[data.status]}`}>
              {data.status}
            </span>
            {data.duration && (
              <span className="text-xs text-gray-500">
                {data.duration}ms
              </span>
            )}
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
          className="w-3 h-3"
        />
      </div>
    );
  }
);

VerticalNode.displayName = 'VerticalNode';
```

For more complex workflows with branching logic (success/failure paths), implementing multiple handles requires careful positioning:

```typescript
export const BranchingNode = memo<NodeProps<BranchingNodeData>>(
  ({ data, selected, isConnectable }) => {
    return (
      <div
        className={`
          flex flex-col w-56 px-4 py-3 bg-white rounded-lg border-2
          ${selected ? 'border-blue-500' : 'border-gray-300'}
        `}
      >
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
        />

        <div className="flex-1 mb-4">
          <h3 className="font-semibold text-sm mb-2">{data.label}</h3>
          <p className="text-xs text-gray-600">{data.description}</p>
        </div>

        {/* Success path */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
            Success
          </span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="success"
            isConnectable={isConnectable}
            className="w-2 h-2"
            style={{ bottom: '20px', left: '30%' }}
          />
        </div>

        {/* Failure path */}
        <div className="flex items-center gap-2">
          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
            Error
          </span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="error"
            isConnectable={isConnectable}
            className="w-2 h-2"
            style={{ bottom: '4px', left: '70%' }}
          />
        </div>
      </div>
    );
  }
);

BranchingNode.displayName = 'BranchingNode';
```

Vertical nodes should be designed with a reasonable aspect ratio that accommodates the typical information needs of workflow visualizations without creating awkwardly narrow or wide nodes. The recommended width range is 180-280 pixels, with height dynamically determined by content but typically 80-150 pixels for single-connection nodes.

## Common Pitfalls and Solutions in Vertical React Flow Implementation

Several recurring challenges emerge when implementing vertical layouts in React Flow. Understanding these pitfalls and their solutions prevents costly debugging and architectural rework.

**Pitfall 1: Incorrect Handle Position Configuration**

The most common mistake involves configuring handles for horizontal flow when vertical flow is intended. This creates a mismatch where nodes appear arranged vertically but handles position as if for horizontal flow, resulting in visually confusing and cross-crossing edges.[2][16]

*Solution:* Audit all nodes to ensure `targetPosition` is set to `Position.Top` and `sourcePosition` to `Position.Bottom` for consistent vertical flow. Use TypeScript strict typing to enforce this consistency across custom node definitions.

**Pitfall 2: Manual Node Positioning Without Layout Recalculation**

When nodes are added dynamically (through user interaction or API calls), maintaining consistent vertical positioning requires recalculating the entire layout. Developers sometimes hardcode new node positions, resulting in overlapping nodes or broken visual flow.[3][32]

*Solution:* Implement automatic layout recalculation whenever the graph structure changes. Use Dagre or ELK to recalculate positions, or if manual positioning is necessary, implement a positioning algorithm that respects existing node spacing and vertical ordering.

**Pitfall 3: Edge Overlap in Multi-Connection Scenarios**

When multiple edges originate from the same node to different targets at similar Y-coordinates, they overlay visually, obscuring the connection graph.[23][45]

*Solution:* Implement multiple source handles positioned distinctly on the source node, with each target edge connecting to a specific source handle. This naturally separates edges and improves clarity. Alternatively, adjust target node Y-coordinates to create natural vertical separation that allows edges to route without overlap.

**Pitfall 4: Performance Degradation Without Proper Memoization**

Vertical layouts with many nodes often experience performance issues because changes to node positions trigger re-renders of all nodes, even those whose visual content hasn't changed.[11][14][46]

*Solution:* Wrap all custom node components in `React.memo`, memoize all callback functions with `useCallback`, and memoize object/array props with `useMemo`. Profile the application using React Developer Tools to identify unnecessary re-renders.

**Pitfall 5: Dimension Information Mismatch in Layout Calculations**

In React Flow v12, accessing `node.width` and `node.height` as measured dimensions (the old v11 behavior) produces undefined values or incorrect results. This breaks layout calculations in Dagre or ELK integrations.[4][22]

*Solution:* Use `node.measured?.width` and `node.measured?.height` for actual measured dimensions. Provide fallback fixed dimensions when measured values are unavailable (typically on first render before measurement completes). Set explicit `width` and `height` properties on nodes if fixed dimensions are desired for layout calculation purposes.

**Pitfall 6: Missing or Incorrect Target/Source Position on Layout Recalculation**

When recalculating layouts with Dagre or ELK, the handle position properties sometimes aren't updated alongside node positions, leaving handles oriented incorrectly after layout changes.[1][32]

*Solution:* Always update `targetPosition` and `sourcePosition` properties when recalculating layout positions. Ensure the layout function returns fully configured nodes with all position-related properties correct.

**Pitfall 7: CSS Styling Conflicts Between React Flow and Application Styles**

Tailwind CSS utility classes or global styles sometimes conflict with React Flow's internal styling, causing unexpected layout or handle appearance issues.[43][61]

*Solution:* Use CSS specificity appropriately, preferring inline React Flow style overrides for critical properties. Scope custom node styles to specific class names to prevent accidental overrides of React Flow internals. Review React Flow's CSS in the distribution to understand which properties might conflict.

## Practical Implementation Strategies and Workflow Integration

Putting all these concepts together requires a systematic implementation approach. This section provides a comprehensive workflow implementation example combining vertical layout, automatic positioning, custom nodes, and performance optimization.

```typescript
// types.ts
export interface WorkflowPhase {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
  nextPhaseId?: string;
  alternativePath?: string;
}

export interface WorkflowGraph {
  phases: WorkflowPhase[];
}

// nodes.tsx
import { Node, Position } from '@xyflow/react';
import { memo } from 'react';
import { Handle } from '@xyflow/react';

interface PhaseNodeData {
  phase: WorkflowPhase;
}

export const PhaseNode = memo<any>(({ data, selected, isConnectable }) => {
  const { phase } = data as PhaseNodeData;

  const statusStyles = {
    pending: 'bg-gray-50 border-gray-300',
    running: 'bg-blue-50 border-blue-300',
    completed: 'bg-green-50 border-green-300',
    failed: 'bg-red-50 border-red-300',
  };

  return (
    <div
      className={`
        w-64 px-4 py-3 rounded-lg border-2 transition-all
        ${statusStyles[phase.status]}
        ${selected ? 'shadow-lg ring-2 ring-blue-500' : 'shadow'}
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
      />

      <div className="mb-3">
        <h4 className="font-semibold text-sm text-gray-900">
          {phase.name}
        </h4>
        <p className="text-xs text-gray-600 mt-1">
          {phase.description}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className={`
          text-xs font-medium px-2 py-1 rounded
          ${phase.status === 'pending' && 'bg-gray-200 text-gray-800'}
          ${phase.status === 'running' && 'bg-blue-200 text-blue-800'}
          ${phase.status === 'completed' && 'bg-green-200 text-green-800'}
          ${phase.status === 'failed' && 'bg-red-200 text-red-800'}
        `}>
          {phase.status.charAt(0).toUpperCase() + phase.status.slice(1)}
        </span>
        {phase.duration && (
          <span className="text-xs text-gray-500">
            {phase.duration}ms
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
      />
    </div>
  );
});

PhaseNode.displayName = 'PhaseNode';

// layout.ts
import dagre from '@dagrejs/dagre';
import { Node, Edge, Position } from '@xyflow/react';

export const getVerticalLayout = (
  nodes: Node[],
  edges: Edge[]
) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB' });

  const nodeWidth = 280;
  const nodeHeight = 140;

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: nodeWidth,
      height: nodeHeight,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const dagNode = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: dagNode.x - nodeWidth / 2,
        y: dagNode.y - nodeHeight / 2,
      },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    };
  });

  return { nodes: newNodes, edges };
};

// App.tsx
import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PhaseNode } from './nodes';
import { getVerticalLayout } from './layout';
import { WorkflowPhase } from './types';

const INITIAL_PHASES: WorkflowPhase[] = [
  {
    id: 'phase-1',
    name: 'Trigger',
    description: 'Workflow triggered by push event',
    status: 'completed',
    duration: 150,
    nextPhaseId: 'phase-2',
  },
  {
    id: 'phase-2',
    name: 'Build',
    description: 'Compile and build application',
    status: 'completed',
    duration: 3200,
    nextPhaseId: 'phase-3',
  },
  {
    id: 'phase-3',
    name: 'Test',
    description: 'Run automated test suite',
    status: 'running',
    nextPhaseId: 'phase-4',
  },
  {
    id: 'phase-4',
    name: 'Deploy',
    description: 'Deploy to production',
    status: 'pending',
  },
];

export default function WorkflowVisualization() {
  // Initialize nodes from phases
  const initialNodes = INITIAL_PHASES.map((phase) => ({
    id: phase.id,
    type: 'phase',
    data: { phase },
    position: { x: 0, y: 0 },
  }));

  // Build edges from phase connections
  const initialEdges = INITIAL_PHASES
    .filter((phase) => phase.nextPhaseId)
    .map((phase) => ({
      id: `${phase.id}-${phase.nextPhaseId}`,
      source: phase.id,
      target: phase.nextPhaseId!,
      type: 'smoothstep',
      animated: true,
    }));

  // Apply vertical layout
  const { nodes: layoutedNodes } = getVerticalLayout(
    initialNodes,
    initialEdges
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const nodeTypes = useMemo(() => ({ phase: PhaseNode }), []);

  const onConnect = useCallback(
    (connection) => {
      setEdges((eds) =>
        addEdge(
          { ...connection, type: 'smoothstep', animated: true },
          eds
        )
      );
    },
    []
  );

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

This implementation demonstrates the complete workflow from data structure through rendering, incorporating all discussed best practices for vertical layout implementation.

## Conclusion: Synthesizing Vertical Layout Best Practices

Implementing effective vertical layouts in React Flow v12 requires understanding the interaction between multiple systems: node positioning, handle orientation, edge routing, automatic layout calculation, performance optimization, and visual styling. The transition from horizontal to vertical layout fundamentally changes how information flows through the visualization, necessitating careful reconsideration of default configurations.

The core principles for successful vertical layout implementation center on consistency in handle positioning using `Position.Top` and `Position.Bottom`, proper dimension handling in React Flow v12 using `node.measured` properties, integration with Dagre or ELK for automatic layout calculation, aggressive memoization for performance, and thoughtful CSS styling that accounts for the unique challenges of vertical information flow.[1][2][4][5][6][11][14][18][22][27][32][46][49]

For workflow execution UIs with 5-20 nodes, implementing a foundation based on these practices provides a solid, performant, and maintainable visualization system. The specific choice between Dagre and ELK depends on the complexity requirements—Dagre suits most standard workflow pipelines, while ELK provides advantages for complex graph structures with edge routing requirements.[5][13][27][32]

The identified pitfalls and their solutions provide a roadmap for avoiding common implementation mistakes that can undermine the effectiveness of vertical layout systems. By understanding these challenges before implementation, developers can architect solutions that scale gracefully and maintain performance even as workflow complexity increases.

Future enhancements to this implementation might include dynamic node expansion/collapse for complex nested workflows, real-time status updates with animated transitions, collaborative editing features for team workflow design, and integration with backend systems for loading and persisting workflow definitions. The foundational architecture established through proper vertical layout implementation provides an excellent basis for these extensions.

Citations:
[1] https://v9.reactflow.dev/examples/layouting/
[2] https://reactflow.dev/api-reference/components/handle
[3] https://github.com/xyflow/xyflow/issues/1113
[4] https://reactflow.dev/learn/troubleshooting/migrate-to-v12
[5] https://reactflow.dev/learn/layouting/layouting
[6] https://reactflow.dev/learn/customization/handles
[7] https://reactflow.dev/examples/layout/auto-layout
[8] https://xyflow.com/blog/react-flow-12-release
[9] https://reactflow.dev/examples/edges/custom-edges
[10] https://github.com/xyflow/xyflow/discussions/2448
[11] https://www.synergycodes.com/blog/guide-to-optimize-react-flow-project-performance
[12] https://reactflow.dev/examples/edges/edge-types
[13] https://reactflow.dev/learn/layouting/layouting
[14] https://reactflow.dev/learn/advanced-use/performance
[15] https://reactflow.dev/api-reference/components/handle
[16] https://reactflow.dev/examples/layout/horizontal
[17] https://reactflow.dev/examples/styling/tailwind
[18] https://reactflow.dev/learn/customization/handles
[19] https://reactflow.dev/learn/customization/theming
[20] https://reactflow.dev/ui/components/base-node
[21] https://reactflow.dev/examples/layout/elkjs
[22] https://reactflow.dev/learn/troubleshooting/migrate-to-v12
[23] https://github.com/xyflow/xyflow/discussions/2757
[24] https://reactflow.dev/examples
[25] https://reactflow.dev/whats-new/2024-07-09
[26] https://reactflow.dev/examples/edges/custom-edges
[27] https://reactflow.dev/learn/layouting/layouting
[28] https://reactflow.dev/examples/nodes/custom-node
[29] https://g6.antv.antgroup.com/en/manual/layout/dagre-layout
[30] https://reactflow.dev/examples
[31] https://reactflow.dev/examples/layout/horizontal
[32] https://reactflow.dev/examples/layout/dagre
[33] https://reactflow.dev/learn/layouting/layouting
[34] https://reactflow.dev/api-reference/types/position
[35] https://reactflow.dev/api-reference/hooks/use-nodes-state
[36] https://reactflow.dev/examples/layout/auto-layout
[37] https://reactflow.dev/learn/customization/handles
[38] https://reactflow.dev/api-reference/hooks/use-edges-state
[39] https://reactflow.dev/examples/nodes/node-position-animation
[40] https://reactflow.dev/ui/components/base-node
[41] https://reactflow.dev/examples/nodes/node-toolbar
[42] https://v9.reactflow.dev/examples/smooth-transition/
[43] https://reactflow.dev/learn/tutorials/getting-started-with-react-flow-components
[44] https://reactflow.dev/learn/concepts/built-in-components
[45] https://github.com/xyflow/xyflow/discussions/2757
[46] https://www.synergycodes.com/webbook/guide-to-optimize-react-flow-project-performance
[47] https://reactflow.dev/examples/layout/expand-collapse
[48] https://reactflow.dev/examples/edges/multi-connection-line
[49] https://reactflow.dev/learn/advanced-use/performance
[50] https://reactflow.dev/pro/examples
[51] https://reactflow.dev/api-reference/types/node
[52] https://reactflow.dev/learn/customization/custom-nodes
[53] https://g6.antv.antgroup.com/en/manual/layout/dagre-layout
[54] https://reactflow.dev/examples/layout/horizontal
[55] https://reactflow.dev/examples
[56] https://www.rdocumentation.org/packages/g6R/versions/0.5.0/topics/dagre_layout
[57] https://reactflow.dev/api-reference/react-flow
[58] https://reactflow.dev/api-reference/types/fit-view-options
[59] https://reactflow.dev/examples/nodes/node-position-animation
[60] https://reactflow.dev/examples/interaction/interaction-props
[61] https://reactflow.dev/learn/customization/theming
[62] https://github.com/wbkd/react-flow/issues/685
___BEGIN___COMMAND_DONE_MARKER___0
