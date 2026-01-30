# UI Patterns for Agent Activity Display - Research Results

**Research Date**: 2026-01-27
**Source**: Perplexity Deep Research

## Executive Summary

Leading AI platforms use **progressive disclosure with collapsible tool cards**, **skeleton screens for streaming**, and **consistent visual differentiation** between message types. Accessibility requires ARIA live regions and keyboard navigation.

## Key Patterns

### 1. Tool Call Display (ChatGPT, Cursor, Claude)

**Collapsible Card Pattern**:
- Tool calls displayed in collapsed cards by default
- Card header shows: tool icon, tool name, status indicator
- Expandable to show: input parameters, full output
- Group tool invocation + result as single unit

```tsx
<ToolCallCard>
  <ToolHeader>
    <ToolIcon name="bash" />
    <ToolName>Running: ls -la</ToolName>
    <StatusIndicator status="complete" />
    <ExpandToggle />
  </ToolHeader>
  <ToolContent expanded={isExpanded}>
    <ToolInput>{command}</ToolInput>
    <ToolOutput>{output}</ToolOutput>
  </ToolContent>
</ToolCallCard>
```

**Visual Treatment**:
- Distinct background color from chat messages
- Monospace font for command/output
- Status colors: blue (running), green (complete), red (error)
- Left border accent for quick scanning

### 2. Thinking/Reasoning Traces

**Progressive Disclosure**:
- Collapsed by default with summary
- Multi-level expansion (summary → details → full trace)
- Visual styling marks as supplementary (lighter background, italic)

**ReTrace Pattern**:
- Hierarchical structure showing reasoning strategy
- Timeline view for sequential reasoning steps
- Graph view for branching decision trees

**Implementation**:
```tsx
<ThinkingBlock>
  <ThinkingSummary>
    Analyzing the codebase structure...
    <ExpandButton />
  </ThinkingSummary>
  <ThinkingDetails expanded={isExpanded}>
    {/* Full reasoning trace */}
  </ThinkingDetails>
</ThinkingBlock>
```

### 3. Streaming Indicators

**Skeleton Screens** (preferred over spinners):
- Show placeholder matching expected content layout
- Animated pulse effect indicates activity
- Replace with real content progressively

**Status Indicators**:
- Pulsing dot for active streaming
- "Executing..." text with animation
- Progress bar for multi-step operations (if deterministic)

```tsx
{isStreaming ? (
  <SkeletonToolOutput />
) : (
  <ToolOutput content={output} />
)}
```

### 4. Message Type Differentiation

**Visual Hierarchy**:
| Type | Background | Border | Icon | Alignment |
|------|------------|--------|------|-----------|
| User | Violet-50 | Left violet | User | Right |
| Assistant | White | None | Bot | Left |
| Tool Call | Zinc-100 | Left blue | Terminal | Left |
| Tool Result | Zinc-50 | Left green | Check | Left (indented) |
| Thinking | Slate-50 | Left gray | Brain | Left (italic) |
| Error | Red-50 | Left red | Alert | Left |

**Grouping Pattern**:
- Group tool call + result visually (card or indentation)
- Group thinking + response together
- Collapse older exchanges as units

### 5. Expandable Sections (Accessible)

**Required ARIA**:
```tsx
<button
  aria-expanded={isExpanded}
  aria-controls="content-id"
  onClick={() => setExpanded(!isExpanded)}
>
  {title}
</button>
<div
  id="content-id"
  aria-hidden={!isExpanded}
  hidden={!isExpanded}
>
  {content}
</div>
```

**Keyboard Support**:
- Enter/Space to toggle
- Escape to close
- Focus remains on trigger after toggle

### 6. Streaming Content (Accessible)

**ARIA Live Regions**:
```tsx
<div
  aria-live="polite"
  aria-atomic="false"
  aria-relevant="additions"
>
  {streamingContent}
</div>
```

**Focus Management**:
- Don't steal focus when new content arrives
- Provide "jump to latest" button
- Maintain scroll position during streaming (unless at bottom)

### 7. Performance Optimization

**List Virtualization** (essential for long conversations):
```tsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={messages.length}
  itemSize={100}
>
  {({ index, style }) => (
    <MessageItem message={messages[index]} style={style} />
  )}
</FixedSizeList>
```

**Conditional Rendering**:
- Don't render collapsed content in DOM
- Lazy load expanded content
- Use Suspense for async content

### 8. Error States

**Error Display Requirements**:
- Specific error message (not generic "Something went wrong")
- Clear recovery action (retry button, alternative suggestion)
- Visual distinction (red border, alert icon)
- Preserve context (don't clear conversation)

```tsx
<ErrorCard>
  <ErrorIcon />
  <ErrorTitle>Command failed: npm build</ErrorTitle>
  <ErrorMessage>
    Exit code 1: missing dependency '@babel/core'
  </ErrorMessage>
  <ErrorActions>
    <RetryButton />
    <CopyErrorButton />
  </ErrorActions>
</ErrorCard>
```

## Common Pitfalls

1. **Treating tool visibility as afterthought** - Design for it from start
2. **Showing verbose output by default** - Use progressive disclosure
3. **Generic error messages** - Be specific about what failed
4. **Missing ARIA for dynamic content** - Screen readers need live regions
5. **No virtualization** - Performance degrades with 100+ messages
6. **Inconsistent visual treatment** - Use consistent colors/icons per type
7. **Poor mobile touch targets** - Minimum 44-48px for expandable triggers

## Tailwind Implementation

```tsx
// Message type styles
const messageStyles = {
  user: 'bg-violet-50 border-l-2 border-violet-500 ml-8',
  assistant: 'bg-white',
  tool_call: 'bg-zinc-100 border-l-2 border-blue-500 font-mono text-sm',
  tool_result: 'bg-zinc-50 border-l-2 border-green-500 ml-4 font-mono text-xs',
  thinking: 'bg-slate-50 border-l-2 border-gray-400 italic text-sm',
  error: 'bg-red-50 border-l-2 border-red-500',
};

// Status indicator
const statusColors = {
  running: 'bg-blue-500 animate-pulse',
  complete: 'bg-green-500',
  error: 'bg-red-500',
  pending: 'bg-zinc-400',
};
```

## React Component Architecture

```
<ConversationView>
  <VirtualizedMessageList>
    <MessageGroup>           {/* Groups related messages */}
      <UserMessage />
      <AssistantMessage>
        <ThinkingBlock />    {/* Collapsible */}
        <TextContent />
        <ToolCallCard>       {/* Collapsible */}
          <ToolHeader />
          <ToolInput />
          <ToolOutput />
        </ToolCallCard>
      </AssistantMessage>
    </MessageGroup>
  </VirtualizedMessageList>
  <StreamingIndicator />
  <InputArea />
</ConversationView>
```

## References

- OpenAI Apps SDK: developers.openai.com/apps-sdk/
- ReTrace: arxiv.org/html/2511.11187v1
- react-window: github.com/bvaughn/react-window
- ARIA Live Regions: developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions
- Flowbite Chat: flowbite.com/docs/components/chat-bubble/
