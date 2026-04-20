# Reference Links and Images

This document tests reference-style links and relative image paths.

Here is a [link to the spec][1] and another [link to the plan][plan-link].

An inline link for comparison: [Chainglass](https://example.com).

## Images

Relative image: ![Architecture diagram](./images/architecture.png)

Another relative: ![Sequence diagram](../diagrams/seq.svg)

Absolute image (unchanged): ![Logo](https://example.com/logo.png)

## Mixed Content

A paragraph with [reference link][1] and ![inline image](./screenshot.png) mixed together.

Some **bold** text with a [shortcut reference][plan-link] in the middle.

## Code Block

```typescript
const x = 1;
const y = 2;
```

## Reference Definitions

[1]: https://example.com/spec "The Specification"
[plan-link]: https://example.com/plan
