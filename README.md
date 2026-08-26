# Diagram Workshop · Integration Notes for Agents

> `doc-to-diagram/index.html` — data structures and adaptation notes for this page. The page itself does not contain this text; read this before changing any data.

## What this page is

"Paste a passage of text, get a structure diagram." Source text on the left, diagram on the right; edit the left and the right follows immediately.
Four layouts (radial mind map / hierarchy tree / directed flow / network) share the same parse result and can be switched at any time.

Mind maps, flowcharts, and architecture diagrams are the most common shapes of "turning text into a diagram",
and they share one trait: **users do not want to choose**. A single line — "make the above into a mind map" — is the entire input.
So the default path of this page is zero-configuration: `auto` looks at the content and picks a layout by itself.

## Input syntax (only four rules)

- **Indentation** means hierarchy. Two spaces or one Tab per level; `-` `*` `·` bullet prefixes are optional.
- **`#` `##` `###`** also count as hierarchy, equivalent to indentation, so Markdown can be pasted straight in.
- **`A -> B`** (or `A → B`) means a directed edge. When arrows appear, `auto` switches to the flow layout.
- **`Node name: note`** — everything after the colon becomes the node's note, shown only when the node is opened; it takes no space on the diagram.

Parsing lives in `parse()`, forty lines. To support another syntax (a subset of mermaid, or your internal
meeting-minutes format), changing that one function is enough; layout and rendering stay untouched.

## Have the agent shape material into a paste-ready outline

The cheapest way to use this page is not to have the agent edit code, but to have it produce **the text in the left pane**:

```
Read the material I gave you and organize it into an outline that can be pasted straight into the left pane of "Diagram Workshop".

The syntax has only four rules:
  indentation (two spaces per level) for hierarchy; # ## ### are equivalent to indentation;
  A -> B for directed flow; append ": note" to a node name for a comment.

Requirements:
1. Keep a single root node at the top: the one thing this material is about.
2. Keep each node name short — a few words at most. Split long titles into "short name + colon note",
   because the diagram only draws the short name; the note appears on click.
3. No more than four levels deep. From the fifth level on, people get lost on the diagram; split it into a second one.
4. Keep sibling counts at 3-7. Beyond seven, group them under another level.
5. If the material is itself a process or timeline, write it with -> as directed edges; do not force it into a tree.
6. One sentence per note, stating "why" and "what to watch out for" — do not restate the node name.

Output the outline text itself only: no code fences, no explanations.
```

## Changing the look

- The three skins live at the top of the CSS: `Paper / Slate / Blueprint`; the top-right button cycles them. To add a fourth,
  add an `html[data-skin=xxx]` block — node colors read `--n1..--n6` and follow automatically.
- Nodes are colored by level: `colorOf(level)`. To color by subtree instead, change it to `colorOf(node.rootBranch)`.
- Label wrapping: `wrap()` estimates width as "one CJK glyph = one unit, ASCII = 0.55" —
  two orders of magnitude faster than per-glyph canvas measurement, and the error is invisible at this font size.
- The exported SVG is self-contained (styles inlined) and drops straight into Figma / Illustrator / PowerPoint.
