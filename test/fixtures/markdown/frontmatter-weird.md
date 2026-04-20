---
title: "Edge-Case Front-Matter"
nested:
  key: "value with --- inside"
  deep:
    list:
      - item one
      - item two
float_val: 3.14159
boolean_val: true
multiline_literal: |
  This is a literal block scalar.
  It preserves newlines exactly.
  Even this one.
multiline_folded: >
  This is a folded block scalar
  that joins lines with spaces
  into a single paragraph.
date: 2026-04-20
empty_key:
---

# Body After Weird Front-Matter

This file tests that the front-matter splitter handles:

1. Nested `---` tokens inside YAML values
2. Multiline scalars (`|` and `>` block styles)
3. Float and boolean YAML values
4. Empty keys

---

The `---` above is an inline thematic break (setext HR), NOT a front-matter fence.

The splitter must NOT treat it as a closing fence.

## Another Section

Some regular prose here with **bold** and *italic* text.
