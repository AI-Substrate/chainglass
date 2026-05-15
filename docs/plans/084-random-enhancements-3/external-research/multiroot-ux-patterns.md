# External Research: Multi-Root Workspace UX Patterns

**Source**: Perplexity Deep Research (Sonar Deep Research)
**Date**: 2026-05-10
**Prompt**: see `multi-folder-tree-research.md` § Research Opportunity 2
**Plan**: 084-random-enhancements-3 — multi-folder tree

---

# Multi-Root Workspace UX Patterns in Modern Code Editors: A Comprehensive Analysis for 2024–2026

This report synthesizes implementation patterns, user experience challenges, and best practices for multi-root workspace design across seven leading code editors: Visual Studio Code, JetBrains family (WebStorm, PyCharm, IntelliJ IDEA), Helix, Zed, Sublime Text 4, Sublime Merge, and Cursor. The analysis reveals that while VS Code pioneered a unified file tree model with per-root settings inheritance, competing editors have taken divergent approaches to addressing core pain points around folder ordering, terminal working-directory resolution, and mixed local-remote configurations. User feedback from GitHub issues, feature requests, and developer forums consistently identifies three dominant friction points: inadequate affordances for managing ten or more roots, ambiguous active-root selection for task and debug configurations, and lack of support for heterogeneous root types (git repositories alongside cloud-synced directories). For a Next.js-based developer tool targeting 10 roots maximum with a '+' / '−' sidebar button, the minimal viable feature set prioritizes intuitive folder reordering, persistent workspace metadata, and clear visual distinction between root types. This report provides a structured UX recommendations matrix distilling canonical patterns and emerging best practices for multi-root workspace interfaces.

## The Evolution and Current State of Multi-Root Workspaces in Code Editors

Multi-root workspaces emerged as a solution to a fundamental developer need: the ability to work across multiple logically related projects without switching editor windows or managing separate instances. Visual Studio Code formalized this pattern around 2017 by introducing the `.code-workspace` file format, which persists a list of root folders with optional global and per-folder settings[1]. The core innovation was recognizing that developers frequently need to edit code in a documentation repository while updating the source code it describes, or collaborate on tightly coupled microservices that live in separate repositories on disk[1]. Rather than treating each folder as an isolated project, VS Code's model allows all roots to coexist in a single window with a unified file explorer tree, cross-folder search, and global source control providers panel.

Today, in May 2026, multi-root support has become an expected feature across most modern code editors, though implementation philosophies differ significantly. JetBrains has embraced Git worktrees as its multi-root mechanism—a Git-native concept where multiple branches can be checked out simultaneously in separate directories, all linked to a shared `.git` history[2]. This approach targets developers whose multi-root scenario is primarily branch-based parallel work. In contrast, Cursor adopted VS Code's architecture wholesale by implementing the multi-root workspace APIs[5], recognizing that the VS Code pattern had proven its efficacy across millions of developers. Sublime Text, maintaining its philosophy of user configuration through text-based project files, offers a distinct model where projects store a list of folders and workspace files persist window state[43]. Zed and Helix, as newer entrants to the ecosystem, are still iterating on multi-root support, with Zed grappling with basic affordances like folder reordering and file picker behavior[3][6].

The maturation of multi-root workspaces has coincided with the rise of monorepo architectures in frontend development, where a single repository may contain dozens of interdependent packages. Tools like pnpm, Turborepo, and Nx manage internal linking, but the code editor's ability to display and navigate multiple logical roots within a unified interface has become critical to developer velocity[33]. The tension between monorepo-scale (100+ packages) and the UI affordances available in current editors (designed for 2–5 roots) creates a category of recurring user complaints and feature requests that shape the landscape of multi-root UX in 2026.

## File Tree Architecture and Root Rendering Patterns

### Visual Studio Code's Unified Sibling Model

VS Code renders multiple root folders as top-level siblings in the File Explorer tree[1][1][1]. When you open a `.code-workspace` file or add a second folder via **File > Add Folder to Workspace**, each root appears as a distinct entry in the left sidebar, typically labeled with its folder name (e.g., "my-folder-a", "my-folder-b"). This sibling model is intuitive for small numbers of roots and allows users to understand the overall structure at a glance. The explorer behaves much like a single-folder project—you can expand and collapse roots, move files between them, and use all standard file operations[1]. When file collisions occur (two roots have a file with the same name), VS Code disambiguates by including the folder name in tab headers, and this can be controlled via the `workbench.editor.labelFormat` setting to show "short", "medium", or "long" paths[1][1].

The sibling model extends to the Quick Open (Ctrl+P / Cmd+P) and Open Editors views, which include the root folder name as a prefix, allowing rapid navigation across multiple projects without friction[1]. This design choice scales reasonably well up to about 5–7 roots, beyond which users report difficulty finding their target folder and experiencing cognitive overhead during navigation. As evidenced by a GitHub issue discussing a developer managing 15+ workspace folders, the lack of built-in sorting or filtering causes frustration, particularly when roots are accumulated incrementally over time without deliberate organization[7].

### JetBrains' Worktree and Multi-Root Module Model

JetBrains IDEs, particularly WebStorm and IntelliJ IDEA, implement multi-root through two distinct mechanisms. First, Git worktrees allow multiple branches to be checked out simultaneously in separate directories, all sharing a central `.git` directory[2]. When a developer creates a worktree, WebStorm treats it as a linked copy of the project; the new directory contains a `.git` file (not a folder) with a plain-text path back to the original repository[2]. This ensures all worktrees remain in sync while maintaining independent working environments. The Worktrees tab in the Git tool window (Alt+9) provides a dedicated interface for creating, listing, and switching between worktrees, with the ability to open a target worktree in a new or existing window[2].

Beyond worktrees, IntelliJ IDEA supports multi-root projects through its module system[38]. A module is an essential part of any project and consists of one or several content roots and a module file. Projects can contain multiple modules, which can be added, grouped, or unloaded as needed[38]. This hierarchical structure allows fine-grained configuration: each module has its own SDK selection, compiler output paths, and library dependencies. When multiple modules are present, IntelliJ automatically groups them in the Project tool window using fully qualified names and dot-prefixed hierarchies (e.g., "cdi.application"), providing a visual organization scheme that scales better than a flat sibling list[38].

### Zed's Emerging Multi-Root Challenges

Zed, as a newer editor built in Rust with a focus on performance, is actively working to expand multi-root support. Currently, if a developer uses the `:open` command with multiple directories, Zed spawns multiple file pickers on top of each other—a suboptimal UX[6]. The Zed team is considering several approaches: changing the default behavior of `:open`, adding a config option in `editor.filepicker`, or introducing a new command like `:picker`[6]. This uncertainty reflects the challenge of designing multi-root affordances when the baseline single-root experience is the default and the editor lacks legacy constraints or established patterns.

Zed's project panel does support file and folder operations with configurable sorting modes, controlled by settings like `sort_mode` and case-sensitive sorting options[17]. However, the project panel's handling of multiple roots remains a design frontier, suggesting that Zed may converge on VS Code's sibling model as the ecosystem stabilizes.

### Sublime Text's Folder-List Approach

Sublime Text treats projects and workspaces as separate concerns[43]. A `.sublime-project` file stores a list of folders that are open, along with settings and build systems that apply only to that window. A `.sublime-workspace` file captures the state of a specific window: open files, layout, cursor positions, find history, and unsaved changes. This dual-file model gives users flexibility to create multiple workspace layouts for the same project—for instance, a "backend-focused" workspace and a "frontend-focused" workspace that filter different folders from view[43]. When adding folders to Sublime, drag-and-drop from the file manager is the primary affordance, combined with **Project > Add Folder** from the menu. This reflects Sublime's philosophy of keeping things flexible and user-driven rather than prescriptive.

## Adding and Removing Roots: Current Canonical UX Patterns

### VS Code's Menu-Driven and Command-Line Approaches

In Visual Studio Code, the canonical method to add a folder is **File > Add Folder to Workspace**, which brings up a native folder picker[1][1]. Once a root is added, it appears immediately in the File Explorer as a top-level entry[1]. This menu-driven approach is explicit and discoverable for users unfamiliar with the feature. VS Code also supports adding folders via drag-and-drop: dragging a single folder into the File Explorer adds it to the current workspace, and dragging multiple folders into the editor region creates a new multi-root workspace[1][1][1]. Additionally, the command line supports the `--add` flag, allowing developers to programmatically add folders to the last active VS Code instance: `code --add vscode vscode-docs`[1]. The flexibility of multiple pathways—menu, drag-drop, and CLI—reflects VS Code's emphasis on user choice and scripting integration.

When a second folder is added to a single-root project, VS Code automatically creates an untitled workspace and stores it as `untitled.code-workspace` in the background[22]. This file remains untitled until the user explicitly saves it via **File > Save Workspace As**. The untitled-then-saved pattern reduces cognitive burden during exploration—users can experiment with adding folders without immediately committing to a workspace file.

Removing a folder is equally straightforward: right-click any root in the File Explorer and select **Remove Folder from Workspace**[1][1]. No confirmation dialog appears; the folder is immediately removed from the workspace. This instant removal reflects a trust model where users are assumed to understand their own actions, though some users have noted that folder reordering and removal UX could be clearer, particularly when managing 15+ roots[7].

### JetBrains' Worktree Dialog and Module Wizards

In JetBrains IDEs, creating a Git worktree involves opening the **Git tool window (Alt+9)**, clicking the **Worktrees tab**, and clicking **New Worktree**[2]. This opens a dialog where users select the source branch (with an option to create a new branch if needed), enter a project name, and specify a directory location[2]. The dialog emphasizes important constraints: you cannot check out the same branch in two worktrees simultaneously, and it is not recommended to create a worktree inside the directory of the current project, as WebStorm misidentifies such projects as multi-root projects, breaking the worktree integration[2]. These guardrails reflect JetBrains' deeper coupling to Git semantics.

For adding modules to an IntelliJ project, the workflow is equally structured: select the top-level directory in the Project tool window, click the toolbar button or press Alt+Insert, then select Module[38]. The **New Module wizard** opens, allowing configuration of the build system (IntelliJ native, Maven, or Gradle) and JDK selection. For importing existing modules, developers specify the path to the `.iml` file, and IntelliJ attaches the module without physically moving files[38]. This wizard-driven approach prioritizes correctness and explicit configuration over quick experimentation.

Deleting a worktree in JetBrains requires first ensuring all changes are committed, then right-clicking the target worktree in the Worktrees tab and selecting **Delete**[2]. Note that you cannot delete the main worktree or the currently open worktree, a safety constraint that prevents users from deleting their active context. This contrasts with VS Code's instant removal model.

### Sublime Text's Drag-and-Drop and Menu Integration

Sublime Text emphasizes drag-and-drop as the primary affordance for adding folders[43]. Users drag a folder from their file manager into the Sublime window to add it to the project. Alternatively, **Project > Add Folder** from the menu provides an explicit alternative. To create and persist a project, users save via **Project > Save Project As**, which prompts for a location and creates a `.sublime-project` file. This file stores the folder list, settings, and build configurations. Unlike VS Code's automatic untitled workspace, Sublime requires explicit save-then-name to persist a project, placing the decision-making burden earlier in the workflow[43].

Removing folders is not explicitly documented in the search results, but the flexibility of the `.sublime-project` file format allows manual editing to remove entries. This reflects Sublime's broader philosophy of text-driven configuration and user self-service.

### Cursor's Alignment with VS Code

Cursor, built on the VS Code foundation, adopts identical UX patterns for multi-root workspaces. Developers add multiple folders via **File > Add Folder to Workspace** or by manually editing the `.code-workspace` file, and Cursor will index all folders, making them accessible for search and navigation[19]. This direct alignment simplifies onboarding for developers migrating from VS Code and ensures that VS Code documentation and tutorials apply directly to Cursor.

### Removal Confirmation Patterns

A notable design tension emerges around removal confirmation. VS Code removes folders instantly without confirmation, reflecting a trust model and rapid recovery via undo (Ctrl+Z / Cmd+Z) applied at the workspace level. In contrast, JetBrains worktrees require committed changes and enforce explicit confirmation, placing safety above speed. Neither approach includes a "destructive action" confirmation dialog (like GitHub's two-factor repository deletion), suggesting that folder removal is not perceived as a high-consequence action compared to, say, deleting a file from disk. The instant-removal model in VS Code has not generated visible user complaints about accidental deletion, though the ambiguity of the drag-to-reorder interaction (does dragging a folder onto another folder move or reorder?) has caused confusion[7].

## Settings Inheritance, Scope, and Per-Root Configuration

### VS Code's Hierarchical Settings Model

Visual Studio Code implements a three-tier settings hierarchy in multi-root workspaces: User settings, Workspace settings (global to all roots), and Folder settings (per-root)[1][1][1][22]. When you transition from a single-root to a multi-root workspace, VS Code automatically migrates editor-wide settings from the first folder to global Workspace settings, ensuring continuity[1]. This migration avoids redundant configuration but requires users to understand which settings apply where.

To avoid configuration collisions, VS Code applies only resource-level settings (those affecting file and folder behavior) in multi-root mode; editor-wide settings like zoom level are ignored at the folder level, since two folders cannot both set the zoom level simultaneously[1][1]. Folder-specific settings override Workspace settings, which override User settings, creating a clear precedence order[1][1][22].

Settings are edited through the Settings editor tabs, allowing users to switch between User, Workspace, and Folder scopes without context switching[1]. Alternatively, command-palette commands like **Preferences: Open Folder Settings** provide direct access to the active folder's configuration. For complex projects with heterogeneous requirements (e.g., a Node.js backend and a Python frontend), this scope-based model is powerful—you can define Python interpreter paths, linter configurations, and debug launch settings per folder while maintaining shared formatting and UI preferences globally.

### Challenges: Python Interpreter Path in Multi-Root

A real-world pain point surfaces in the Python extension's handling of `python.defaultInterpreterPath` in multi-root workspaces. According to a GitHub issue, the Python extension ignores `defaultInterpreterPath` defined in workspace configuration files and only respects it when defined in individual `.vscode/settings.json` files. Users working with monorepos where each folder has its own virtualenv must work around this limitation by using scoped variables like `${workspaceFolder:python-a}/.venv/bin/python`. This suggests that while the settings hierarchy is architecturally sound, extension authors sometimes lack clear patterns for respecting per-folder configuration in multi-root contexts.

### JetBrains' Module-Based Configuration

JetBrains ties configuration more tightly to modules and project structure. Each module can have its own SDK (Java version, Python interpreter, Node.js runtime), build system configuration, and library dependencies[38]. This per-module granularity eliminates ambiguity—there is no global-vs-module precedence struggle because the model is inherently modular. However, this rigidity also means that shared configuration (e.g., code style settings) must be managed at the project level or enforced through shared `.editorconfig` files or IDE inspection profiles.

### Sublime Text's Flexible Project Scope

Sublime Text's settings model is simpler: a `.sublime-project` file can contain project-level settings that apply to all folders in that project, and `.sublime-workspace` files can override or extend these settings for a specific window state[43]. This flatter hierarchy reduces cognitive overhead but offers less granularity for complex multi-root scenarios.

## Cross-Root Search and File Navigation

### VS Code's Unified Global Search

VS Code's Find in Files feature works across all folders in a multi-root workspace by default, grouping results by folder[1][1]. This unified search is powerful for refactoring across multiple projects and understanding interconnections. Users can refine scope by using the `./` syntax in the **files to include** box to search within a single root folder[1]. The ability to toggle between global and per-folder scope without leaving the search interface is a key affordance that distinguishes VS Code from single-root-only editors.

The Quick Open (Cmd+P / Ctrl+P) interface also searches across all roots, with folder names shown as prefixes to disambiguate results[1][1]. This is particularly valuable for large monorepos where the same filename may appear in multiple packages.

### Terminal and Working Directory Ambiguity

A recurring theme in multi-root UX is ambiguity about the active root, particularly for terminal working directories. In VS Code, opening a terminal defaults to the first root folder's working directory, but selecting a different root folder in the File Explorer does not automatically change the terminal's cwd[8]. Additionally, when setting `terminal.integrated.cwd` globally and trying to override it for specific folders, the terminal respects only one of the two settings, not both[8]. Users report a workaround: overwriting `terminal.integrated.cwd` in each sub-folder and setting it back to `./`[8]. This friction point highlights a gap between intuitive user expectations (terminal cwd follows selected root) and VS Code's actual behavior (terminal cwd is set once at launch).

In VS Code's February 2026 update, this pain point is being addressed: when opening an external terminal in a multi-root workspace using Ctrl+Shift+C or the **Terminal: Open New External Terminal** command, VS Code now prompts users to select a workspace folder, and the selected folder is used as the working directory for the external terminal[49][49]. This explicit selection pattern, though adding one interaction step, resolves ambiguity and gives users full control.

## Task and Debug Configuration Active-Root Resolution

### VS Code's ${workspaceFolder} Variable Semantics

One of the most subtle and frequently misunderstood aspects of multi-root workspaces is how tasks.json and launch.json resolve their working directory and context. In single-root projects, `${workspaceFolder}` refers unambiguously to that root. In multi-root projects, variables are resolved relative to the folder they belong to[1][1]. This means that if you define a task in the `.vscode/tasks.json` file within one root, `${workspaceFolder}` in that task refers to that specific root[1][1].

However, if you define a task in the global workspace settings (the `.code-workspace` file), the semantics become ambiguous. To address this, VS Code supports scoped variables: `${workspaceFolder:Client}` or `${workspaceFolder:Server}` in a multi-root workspace with folders named Client and Server[14]. This allows a single task or debug configuration to reference sibling roots unambiguously. Without folder names, the variable is scoped to the same folder where it is used[14].

### Canonical Precedence: File, Folder, Workspace

For debug and task configurations, VS Code searches in the following order: first, configurations in `.vscode/launch.json` or `.vscode/tasks.json` within the specific folder being debugged; second, configurations in the `.code-workspace` file; third, configurations in global user settings[1]. This precedence ensures that folder-specific configurations take priority, allowing each root to define its own debugging and build workflows.

### Unresolved Pain Points: Ambiguous Active Root

Despite these mechanisms, ambiguity persists. A GitHub issue titled "New debug/run experience always writes launch.json into..." reports that VS Code's "Create a launch.json file" link always creates the file in the first workspace folder, regardless of which folder the developer intended[16]. A suggested workaround is to reorder folders so that the intended root with `.vscode/launch.json` comes first[16]. This reactive reordering pattern is awkward and suggests that VS Code's UI for creating launch configurations in multi-root contexts lacks clarity about which root will be affected.

Another issue, titled "Multi-root Workspace Folders Are Not Honored for Tasks' Terminal cwd," highlights that task-specific terminal working directories do not always respect the folder in which the task is defined[34]. Developers working with tightly coupled services (e.g., a Python API backend and JavaScript frontend) find it necessary to override `terminal.integrated.cwd` in each folder's `.vscode/settings.json` rather than relying on task-level configuration[34].

### JetBrains' Module-Aware Execution Context

JetBrains avoids much of this ambiguity by tying execution contexts directly to modules. When you select a module and choose **Run** or **Debug**, the IDE automatically uses that module's configuration and sets the working directory to the module's root[38]. This explicitness reduces confusion, though it requires users to understand the module structure.

## Folder Ordering, Reordering, and Aliasing

### VS Code's Drag-to-Reorder Affordance and UX Confusion

VS Code allows reordering of folders via drag-and-drop in the File Explorer[1][1][1][1]. However, this affordance is poorly discoverable and confusing in its interaction model. A developer working with 15+ workspace folders reports that "dragging the folders around to reorder them in the sidebar should update it in the .code-workspace file anyway," and that having more than 15 folders in arbitrary order causes unnecessary constant effort when finding and switching between projects[7]. A third-party plugin, **WorkspaceSort**, allows right-clicking on a workspace folder and choosing **Sort Workspace Folders**, providing an explicit alternative to drag-to-reorder[7].

The underlying issue is that the drag-to-reorder UI feels like it should move a folder into another folder (thus changing the hierarchy), rather than simply reordering siblings[7]. This semantic ambiguity has led some users to believe that drag-and-drop reordering was not supported, when in fact it is available but non-obvious. Adding name aliases or custom labels to roots—suggested in the Zed community—might clarify the intent: "alias the given roots" with custom display names rather than relying on folder names alone[3].

### Sorting Explorer Settings Conflict

VS Code has an **Explorer > Sort Order** setting that defaults to alphabetical sorting. This setting applies to folders within a root, but it is ambiguous whether it should also apply to the root folders themselves[7]. Some users expect the root folders to be sorted alphabetically, while others want to maintain a custom order (the order in which they are added, or a deliberate hierarchy). Currently, the root ordering follows the order defined in the `.code-workspace` file and is controlled by drag-and-drop, not by the Explorer sort setting. This inconsistency creates friction.

### Folder Naming and Display in the UI

For folders with colliding names, VS Code includes the parent directory name in the tab header to disambiguate[1]. The `workbench.editor.labelFormat` setting with values "medium" or "long" can be used to always display folder paths in tabs, reducing ambiguity[1]. However, for dozens of roots, even full paths in tabs become unwieldy.

## Accessibility and Keyboard Navigation in Multi-Root Contexts

### Focus Management and Tree Navigation

Standard keyboard navigation in the File Explorer tree involves Tab to move between elements, Arrow keys to navigate up/down/left/right within the tree, and Enter to activate a node[15]. When the tree has multiple top-level roots (as in VS Code's multi-root model), the focus order should follow the visual hierarchy: first root, then its children, then second root and its children, and so forth[15]. VS Code's implementation appears to follow this pattern, though explicit accessibility testing is recommended.

A broader accessibility principle is that visible focus indicators must be present and have sufficient contrast[15]. In VS Code's light and dark themes, the selected folder in the File Explorer is highlighted with background color and often a focus ring, meeting basic WCAG 2.1 criteria for focus visibility[15]. However, when dozens of roots are present, the focus order becomes very long, and users may need to press Arrow key many times to reach a desired root, making keyboard-only navigation tedious.

### Keyboard Shortcut Affordances for Add/Remove

Neither VS Code nor JetBrains exposes keyboard shortcuts for adding or removing roots directly; the primary interaction remains menu-based (**File > Add Folder to Workspace**) or command-palette based (**Preferences: Open Workspace Settings**). For users who rely entirely on keyboard navigation, this represents a minor accessibility gap. A dedicated shortcut (e.g., Ctrl+Shift+A for "Add Root", Ctrl+Shift+R for "Remove Root") would reduce friction, though introducing new keybindings risks conflicts with existing extensions and user customizations.

### Multi-Root as a Complication for Assistive Technology Users

For users of screen readers, the multi-root tree structure introduces additional cognitive overhead. A developer using NVDA or JAWS navigating a 10-root workspace must:

1. Press Tab to enter the File Explorer.
2. Navigate with Arrow keys through 10 root nodes.
3. Expand each root to find the target file or folder.

Without spatial grouping cues or filtering, this is significantly more tedious than navigating a single-root project. Providing a "collapse all roots except current" shortcut or a search/filter interface scoped to one root could mitigate this, but current editors lack such affordances.

### Search Scope Switching and Multi-Root Awareness

VS Code's Find in Files UI allows scoping to a single root via the `./` syntax, but this is not discoverable or intuitive for keyboard-only users. A dedicated UI toggle or a search-scope dropdown would improve keyboard navigation. Similarly, being able to press a modifier key (e.g., Ctrl+F for global search, Ctrl+Shift+F for folder-scoped search) would reduce reliance on textual syntax.

## Persistent Workspace Metadata and Reliability

### The .code-workspace File: Format and Semantics

VS Code's multi-root workspaces are persisted in `.code-workspace` JSON files, which store the list of folders (with optional relative paths), workspace-level settings, and task/debug configurations[22]. The format is straightforward:

```json
{
  "folders": [
    { "path": "my-folder-a" },
    { "path": "my-folder-b" }
  ],
  "settings": {
    "editor.formatOnSave": true
  },
  "launch": { ... },
  "tasks": { ... }
}
```

Relative paths in the `folders` section are resolved relative to the `.code-workspace` file's directory, making it portable: teams can commit the `.code-workspace` file to version control, and all developers will resolve the same paths[22]. This is a canonical pattern for multi-root workspaces and is now adopted by Cursor as well[5].

### Workspace File Placement and Versioning

A design question arises: where should the `.code-workspace` file live? If it lives at the project root (above all the folders it references), moving the folder structure breaks paths. If it lives in one of the referenced folders, it creates a coupling. Common practice is to store `.code-workspace` files in a dedicated workspace directory or directly in a monorepo root, committing them to version control so teams share the same structure.

### Implicit vs. Explicit Workspace Persistence

When users add a second folder to a single-root project in VS Code, an "UNTITLED WORKSPACE" is created in the background as `untitled.code-workspace`[1][22]. This implicit workspace remains untitled until the user explicitly saves it via **File > Save Workspace As**. This deferred-commitment pattern is user-friendly for exploratory workflows but can be confusing if users expect the workspace to be saved automatically. Some users lose their multi-root configuration when restarting VS Code if they forget to save the workspace explicitly.

## User Complaints and Pain Points: A Synthesis

### Recurring Complaint #1: Folder Ordering at Scale

The most-upvoted complaint across multiple GitHub issues is the difficulty of managing folder order when a workspace contains 15 or more roots. Users report that the current drag-to-reorder mechanism is non-obvious, and there is no built-in alphabetical sorting for root folders (only for children within a root)[7]. A developer managing many roots feels constant friction when switching between projects or adding new ones, as there is no predictable organization. The suggested solution—explicit sorting options (alphabetical, by modification time, by custom order)—remains unimplemented in VS Code as of May 2026. JetBrains' module grouping with dot-prefixed hierarchies (e.g., "backend.api", "backend.auth", "frontend.web") offers a more scalable organizational model, though it requires upfront structure.

### Recurring Complaint #2: Terminal Working Directory Ambiguity

The second most-cited pain point is the behavior of `terminal.integrated.cwd` and task working directories in multi-root workspaces[8][34][35]. Users expect that selecting a different root folder in the File Explorer will change the terminal's working directory, or that defining a task in a specific folder will cause the terminal spawned by that task to start in that folder. Instead, the terminal's cwd is typically set at launch and does not follow folder selection. Users report needing to manually set `terminal.integrated.cwd` to `./` in each folder's `.vscode/settings.json` as a workaround[8]. While the February 2026 VS Code update improves this for external terminals, the issue persists for integrated terminals.

### Recurring Complaint #3: Active Root Ambiguity for Debug Configuration

When creating a debug configuration or launch configuration in a multi-root workspace, it is unclear which folder's `.vscode` directory will receive the generated `launch.json`[16]. VS Code defaults to the first folder, but users often expect it to be created in the currently selected or active folder. This ambiguity has led users to develop workarounds: manually moving the `launch.json` file, reordering folders, or editing the `.code-workspace` file directly[16]. Explicit UI indicating which root will be modified would alleviate this confusion.

### Recurring Complaint #4: Lack of Support for Mixed Local-Remote Roots

A feature request in Cursor's forum asks for support for multi-root workspaces mixing local and remote SSH folders[32]. A developer with client code locally (e.g., ~/GHULbenchmark) and server code on a VPS (/var/www/shared-api) wants a single workspace with both roots visible in the file tree, enabling cross-root search and refactoring without switching windows. A workaround has been discovered: using `sshfs` to mount the remote directory locally, making it appear as a local folder[32]. However, native support for remote roots in multi-root workspaces would be more robust. JetBrains and VS Code both support remote development via plugins (Remote-SSH for VS Code, Remote Development for JetBrains), but integrating remote folders directly into a multi-root workspace remains limited.

### Recurring Complaint #5: Monorepo Scale Complexity

While not a single unified complaint, the broader issue of monorepo scale is reflected in multiple issues: Pylance's need for extraPaths/PYTHONPATH configuration in multi-root contexts[13], Zed's file picker spawning multiple instances[6], and the general consensus that multi-root workspaces work well for 2–5 roots but degrade in UX at 20+ roots[33]. Teams using monorepos with dozens of packages find themselves working around editor limitations via build tools (Turborepo, Nx) that abstract over the folder structure, rather than relying on the editor to manage the complexity directly.

## Minimal Viable Feature Set vs. Second-Order Features

### MVP for a Next.js Developer Tool with ~10 Roots Max

For a Next.js-based developer tool implementing multi-root support with an archetype of git repo + cloud-synced docs folder (~10 roots max), the minimal viable feature set should include:

**Adding roots:** A '+' button in the sidebar that opens a native folder picker, allowing users to select a folder and add it as a sibling root. The folder should appear immediately in the tree, and the workspace should be saved persistently (either auto-saved or with a clear save indicator).

**Removing roots:** A '−' button or context menu option on each root entry that removes it from the workspace. For cloud-synced folders (OneDrive, iCloud), removal should be from the workspace only, not from the file system. An instant removal (no confirmation) is acceptable if undo is supported at the workspace level.

**Visual distinction:** Each root should display its folder name and, if possible, an icon indicating its type (git repo, cloud folder, plain directory). This helps users quickly identify why a folder is included and its source of truth for synchronization.

**Reordering:** Drag-to-reorder support in the tree, with visual feedback (e.g., a placeholder line showing where the folder will be placed). Alternatively, an explicit **Move Up** / **Move Down** context menu option is more discoverable for users unfamiliar with drag-and-drop.

**Cross-root search:** Global find functionality that searches across all roots by default, with a toggle to filter to a single root. This is critical for refactoring and understanding dependencies between roots.

**Per-root terminal cwd:** When a user selects a folder in the tree and opens a terminal (or runs a task), the terminal should start with that folder's path as the working directory. This eliminates the ambiguity of terminal location.

### Second-Order Features Users Request After MVP Ships

**Custom root labels and aliases:** Allow users to rename roots to something other than their folder name. A developer with multiple "apps" folders in different monorepos would benefit from aliasing them to "Monorepo-A: Apps" and "Monorepo-B: Apps". This is particularly valuable in cloud-synced scenarios where folder names are auto-generated or generic.

**Root grouping and hierarchies:** Similar to JetBrains' module dot-prefix system, allow developers to group roots under custom categories (e.g., "Backend", "Frontend", "Docs"). This provides visual organization without changing the actual folder structure and scales to 50+ roots.

**Scoped run contexts:** Allow developers to define which root's configuration (`.env`, `package.json`, build settings) should be used when running a task or opening a terminal. This is particularly important for monorepos where different packages have different build systems or environment setups.

**Cloud-sync indicators:** Visual indicators showing which roots are synced to cloud services (OneDrive, iCloud, Dropbox) and their sync status (syncing, synced, error). This is valuable for developers who mix local and cloud-synced folders and need to understand which files are safely backed up.

**Root-specific settings and extensions:** Allow disabling certain extensions or settings for specific roots. For instance, a developer might want Python linting on the backend root but disable it on a documentation root, all within the same workspace.

**Workspace templates:** Provide a way to save a workspace configuration as a template and reuse it for new projects. This is valuable for teams with repeatable monorepo structures (e.g., "Frontend + Backend + Docs").

**Collaborative workspace sharing:** Allow developers to share a `.code-workspace` file with teammates, with automatic path resolution and conflict detection if someone's folder structure differs. This supports pair programming and team onboarding.

## Monorepo Architectures and Workspace Package Managers

### The Relationship Between Workspaces and Build Orchestration

Modern frontend monorepos rely on workspace package managers like pnpm, yarn, and npm 7+ workspaces, combined with build orchestrators like Turborepo and Nx[33]. These tools manage internal linking and dependency resolution, but they operate at the package level, not the file-system level. A pnpm workspace with a root `package.json` containing `"workspaces": ["apps/*", "packages/*"]` will scan those directories and define the topology at install time[33][44].

The code editor's multi-root workspace is orthogonal to the package manager's workspace: they both model the same logical structure (multiple related packages) but at different layers. A developer might use pnpm's workspace linking (which ensures internal dependencies resolve correctly via the `workspace:*` protocol) while also using VS Code's multi-root workspace (which ensures the editor displays all relevant folders in the tree and allows cross-folder search). The mental model required to understand both is non-trivial, and some developers conflate the two, leading to confusion.

### Bridging the Gap: Editor-Aware Build Configuration

An emerging best practice is to commit a `.code-workspace` file to the monorepo root, explicitly enumerating the main packages and their paths[22]. This allows developers to open a single workspace file and immediately see the full structure, without manually adding folders. Tools like Nx provide project graph visualization directly in the IDE, reducing the need for the editor to display all folders. However, smaller monorepos (2–5 packages) often lack such tooling and rely on multi-root workspaces as the primary organizational interface.

## Recommended UX Patterns: Synthesis and Best Practices

### Tree Rendering: Unified Sibling Model with Type Indicators

**Recommendation:** Display multiple root folders as top-level siblings in the file tree, following VS Code's pattern. Each root should display its folder name, followed by an optional type indicator in brackets or via an icon (e.g., "[Git]", "[Cloud]", "[Local]"). For developers adding cloud-synced folders, a brief sync status indicator (synced, syncing, error) provides actionable feedback without clutter.

**Rationale:** The sibling model is intuitive for up to ~7 roots and remains usable up to ~15 roots if folders are organized alphabetically or by category. Type indicators help users understand the folder's source and maintenance model at a glance.

### Adding Roots: Button + Native Folder Picker + Persistence

**Recommendation:** Place a '+' button in the sidebar title bar (above the list of roots) or as a context menu option (**File > Add Folder to Workspace**). Clicking triggers a native folder picker. When a folder is selected, it is added immediately and the workspace is auto-saved. If auto-save is not feasible, a persistent "Save Workspace" indicator should appear, with keyboard shortcut Ctrl+Shift+S / Cmd+Shift+S.

**Rationale:** A dedicated '+' button is discoverable and works well for small-N (≤ 10 roots). Auto-save reduces friction compared to VS Code's current two-step flow (add, then explicitly save workspace). For cloud-synced folders, consider adding a **Sync Status** indicator to the picker or sidebar so users know which folders are actively synced.

### Removing Roots: Context Menu with Optional Undo

**Recommendation:** Right-click on a root and select **Remove from Workspace**. Removal is instant (no confirmation dialog) but undoable via Ctrl+Z / Cmd+Z at the workspace level. For cloud-synced folders, clearly label the removal as "Remove from Workspace (Folder Stays on Disk / Cloud)" to prevent user confusion.

**Rationale:** Instant removal provides fast feedback and trust in user intent. Undo support recovers from mistakes without requiring confirmation dialogs, which can desensitize users to actual destructive actions.

### Reordering Roots: Explicit Buttons over Drag-to-Reorder

**Recommendation:** Provide explicit **Move Up** / **Move Down** context menu options for each root, or arrow buttons next to each root in the sidebar. Drag-to-reorder can be supported as a secondary mechanism but should not be the primary affordance.

**Rationale:** Explicit buttons are discoverable, unambiguous, and accessible to keyboard-only and screen-reader users. For very large workspaces (20+ roots), consider adding a **Sort Alphabetically** option at the workspace level.

### Root Labels: Show Folder Name + Optional Custom Alias

**Recommendation:** Display each root's folder name by default (e.g., "my-app", "docs", "shared-utils"). Allow users to set a custom alias via a **Rename Root** context menu option, which is stored in the `.code-workspace` file without affecting the actual folder name on disk. Show the alias if set, with the original folder name visible on hover or in a tooltip.

**Rationale:** Folder names are the most recognizable default. Custom aliases are valuable for clarifying context (e.g., renaming a generic "packages/auth" to "Backend: Authentication") and for disambiguating roots with colliding names. Storing the alias in the workspace file ensures it's portable and shareable with teammates.

### Settings Inheritance: Clear UI for Scope Selection

**Recommendation:** In the settings editor, make the scope tabs (User, Workspace, Folder) visually distinct and easy to switch between. When editing a setting, show a clear indicator of which scope is currently active. For multi-root, provide a warning or tooltip if a setting is defined in multiple scopes, highlighting the precedence (Folder > Workspace > User).

**Rationale:** The three-tier settings model is powerful but can be confusing. Clear visual feedback reduces mistakes and unintended cascading of configuration.

### Search Scope: Provide Toggle + Default Global

**Recommendation:** In the Find in Files UI, show a toggle or dropdown to switch between global (all roots) and folder-scoped search. Default to global. Provide a keyboard shortcut (e.g., Ctrl+Alt+F for folder-scoped) to toggle scopes without using the mouse.

**Rationale:** Global search is the most common use case (understanding dependencies, cross-cutting refactors). Folder-scoped search is a secondary need. Keyboard shortcuts enable efficient switching for power users.

### Terminal CWD: Follow Selected Root, with Visual Feedback

**Recommendation:** When a user selects a different root in the File Explorer, the active terminal's prompt or title should update to indicate the root's path. When opening a new terminal, default its cwd to the currently selected root. Show a clear cwd indicator in the terminal tab (e.g., "Terminal (~/monorepo/apps/web)").

**Rationale:** Following the selected root provides intuitive behavior and reduces context-switching costs. Visual feedback (cwd in tab title) ensures users always know where their terminal is operating.

### Debug/Task Active-Root Resolution: Explicit Selection Dialog

**Recommendation:** When creating a new debug configuration or task in a multi-root workspace, show a dialog asking users to select the target root. Generate the `.vscode/launch.json` or `.vscode/tasks.json` file in that root's `.vscode` directory. For existing configurations, show which root they belong to via a label in the Run/Debug view.

**Rationale:** Explicit selection eliminates the "which root did I just configure?" confusion. Labels in the Run/Debug view provide clarity at a glance.

### Accessibility: Support Keyboard-Only Navigation

**Recommendation:** Ensure all multi-root operations (add, remove, reorder, search scope) are accessible via keyboard. Provide dedicated shortcuts for high-frequency operations. Ensure focus order in the tree follows the visual layout and that focus indicators are always visible with sufficient contrast.

**Rationale:** Keyboard-only users and users with motor disabilities must not be disadvantaged by multi-root complexity. Dedicated shortcuts also benefit power users.

## Conclusion: Navigating the Multi-Root Design Space

As of May 2026, multi-root workspaces have evolved from a niche feature in VS Code to a standard capability across most modern code editors. However, the design space remains contested: VS Code's unified sibling model scales reasonably to ~7–15 roots, JetBrains' module hierarchies scale to dozens with explicit organization, and emerging editors like Zed are still discovering the right UX patterns for their architectures. User feedback consistently surfaces five pain points—folder ordering at scale, terminal working directory ambiguity, debug configuration active-root confusion, lack of local-remote mixing, and monorepo complexity—that have not been fully solved by any single editor.

For a Next.js developer tool targeting 10 roots maximum, prioritizing intuitive reordering, persistent workspace metadata, and clear active-root resolution will yield a compelling user experience that exceeds the current state-of-the-art in most code editors. Implementing second-order features like custom root aliases, type indicators for cloud-synced folders, and explicit sort options will further differentiate the tool and support the emerging workflow of mixed local and cloud-synced collaboration. Grounding the design in established patterns from VS Code and JetBrains—while being deliberate about improving weak points—positions the tool to feel familiar to existing developer audiences while addressing real friction points they have articulated through GitHub issues and feature requests.

The appendix that follows presents a comprehensive UX recommendations matrix distilling the canonical patterns and emerging best practices for seven key design decisions across three leading editor families.

---

## Appendix: Multi-Root Workspace UX Recommendations Matrix

| Design Decision | Visual Studio Code | JetBrains IDEs | Zed | Our Recommendation | Citations |
|---|---|---|---|---|---|
| **Tree Rendering Model** | Unified sibling roots in File Explorer; folder names with optional parent-dir disambiguation in tabs | Module hierarchies with dot-prefixed grouping (e.g., "backend.api"); separate Worktrees tab in Git tool | Multiple file pickers spawned in sequence (current limitation); moving toward unified model | Unified sibling roots with type indicators ([Git], [Cloud], [Local]) for ~10 roots max; consider grouping UI for 20+ roots | [1][1][1][38] |
| **Adding Roots (Add Button)** | **File > Add Folder to Workspace** menu + native picker; also drag-drop and CLI `--add` flag | Git worktrees: Git tool Alt+9 > New Worktree dialog with branch selection; Modules: Alt+Insert in Project tool window | Not yet standardized; file picker approach under discussion | '+' button in sidebar title bar → native folder picker → auto-save workspace; visual feedback ("saving…" indicator) | [1][1][19][2] |
| **Removing Roots (Remove Button)** | Right-click root > **Remove Folder from Workspace**; instant removal, no confirmation | Worktrees: right-click > Delete (requires committed changes; cannot delete main/current worktree); Modules: remove via Project Structure dialog | Not yet standardized | Right-click root > **Remove from Workspace**; instant removal but undoable via Ctrl+Z; clarify "Folder Stays on Disk" for cloud-synced roots | [1][2][1] |
| **Reordering Roots** | Drag-to-reorder in File Explorer tree (unintuitive; can be confused with move-into-folder operation); no visual feedback for sort order | Reordering via drag-drop in Project tool; explicit order in `.iml` file hierarchy | Not yet standardized | Explicit **Move Up** / **Move Down** context menu options; drag-to-reorder as secondary; visual placeholder line during reorder | [1][7] |
| **Root Labels / Display Names** | Folder name (e.g., "my-app"); parent-dir shown in tabs on collision; configurable via `workbench.editor.labelFormat` | Module names with dot-prefix hierarchy for grouping (e.g., "cdi.application"); namespace provided by IntelliJ's module naming system | Not yet standardized | Show folder name by default; allow custom alias via **Rename Root** context option; store alias in `.code-workspace`; show on hover or tooltip | [1][1][38] |
| **Per-Root Settings Inheritance** | Three-tier: User > Workspace (global) > Folder; conflict avoidance via resource-only settings at folder level; unclear UI for precedence  | Module-centric: each module has SDK, build system, libraries; simpler mental model but less flexible for shared config | Not yet standardized | Clear Settings editor tabs (User / Workspace / Folder) with scope indicator; tooltip showing precedence; warning if setting is overridden in multiple scopes | [1][1] |
| **Search Scope (Global vs. Per-Root)** | Default global (all roots); per-root via `./` syntax in **files to include** box (non-intuitive) [1][1] | Typically scoped to module or project; global search available but less common in module-heavy workflows | Not yet standardized | Toggle or dropdown in Find UI: Global (all roots) vs. Single Root; default global; keyboard shortcut (Ctrl+Alt+F) for folder-scoped | [1][1][1] |
| **Terminal CWD Resolution** | Terminal cwd set at launch (usually first root); does not follow File Explorer selection; workaround: override `terminal.integrated.cwd` per folder [8][34] | Module-aware: terminal cwd set based on selected module; clearer but less flexible for cross-module workflows | Not yet standardized | Terminal cwd follows selected root in File Explorer; visual feedback in terminal tab title (e.g., "~/monorepo/apps/web"); new terminal defaults to selected root cwd | [8][34][49][49] |
| **Debug/Task Active-Root Selection** | Ambiguous: `${workspaceFolder}` resolves to folder it belongs to; scoped variables `${workspaceFolder:rootName}` for sibling access; create-config always defaults to first root [16][14][14] | Module-centric: debug configs tied to module; execution context clear but requires module structure | Not yet standardized | Show dialog when creating debug config: "Select target root for launch.json"; generate in selected root's `.vscode` directory; label configs with root name in Run/Debug view | [1][16][1][14] |
| **Removal Confirmation** | None; instant removal; undo via Ctrl+Z at workspace level [1] | Deletion of worktree requires committed state and explicit confirmation; cannot delete main/current worktree [2] | Not yet standardized | No confirmation; instant removal; undo via Ctrl+Z; message for cloud-synced roots clarifying "Remove from Workspace (Folder Stays on Cloud)" | [1][2] |
| **Accessibility: Keyboard Navigation** | Standard Tab/Arrow keys in tree; focus order follows visual layout; no dedicated shortcuts for add/remove; focus indicators present [15] | Keyboard shortcuts for module operations (Alt+Insert to add); worktree operations via Git tool (keyboard accessible); module grouping reduces tree depth | Not yet standardized | Dedicated keyboard shortcuts: Ctrl+Shift+A (add root), Ctrl+Shift+R (remove root), Ctrl+Shift+O (reorder); ensure focus indicators visible and have sufficient contrast; logical focus order in tree | [15][2] |
| **Cloud-Sync and Mixed-Type Roots** | Not directly supported; workaround: mount remote via SSH/sshfs or use Remote-SSH extension [32] | Not directly supported; Git worktrees are git-specific; modules are local only [32] | Not yet explored | Type indicator per root: [Git], [Cloud], [Local]; sync status badge for cloud folders; tooltip showing sync provider (OneDrive, iCloud, Dropbox) and last sync time | [32] |

---

**Key Sources Cited in Matrix:**

[1][1][1] – VS Code multi-root workspace documentation and UI patterns (File > Add Folder, File Explorer tree rendering, per-folder settings).

[2][10][38] – JetBrains worktrees (Git-native multi-branch checkout) and module system (hierarchical configuration and project structure).

[7] – GitHub issue #41351: User frustration with 15+ workspace folders and lack of alphabetical sorting; workaround via WorkspaceSort plugin.

[8][34][35] – GitHub issues on terminal cwd ambiguity: terminal does not follow selected root, `terminal.integrated.cwd` setting conflicts, workaround of per-folder override to `./`.

[16] – GitHub issue #87237: Debug config creation always writes to first root; reordering folders is workaround.

[32] – Cursor feature request #146363: Multi-root workspace with local + Remote SSH roots; workaround via sshfs mount.

[14][14][14] – VS Code variables reference: `${workspaceFolder}`, `${workspaceFolder:rootName}` scoped variables, env variable substitution.

[49][49] – VS Code v1.110 February 2026 release notes: external terminal now prompts for root selection in multi-root workspaces.

 – GitHub issue: Python interpreter path not respected in multi-root workspace; workaround via `${workspaceFolder:folderName}` scoping.

This matrix synthesizes the current state of multi-root UX across leading editors and provides a roadmap for implementing a thoughtful, user-centered multi-root workspace interface that avoids documented pain points while embracing best practices from the ecosystem.

Citations:
[1] https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces
[2] https://www.jetbrains.com/help/webstorm/use-git-worktrees.html
[3] https://github.com/zed-industries/zed/issues/15120
[4] https://forum.sublimetext.com/t/projects-and-workspaces/7948
[5] https://github.com/anysphere/cursor-wiki/blob/main/Adopting-Multi-Root-Workspace-APIs.md
[6] https://github.com/helix-editor/helix/discussions/11589
[7] https://github.com/microsoft/vscode/issues/41351
[8] https://github.com/microsoft/vscode/issues/142520
[9] https://github.com/RooCodeInc/Roo-Code/issues/8041
[10] https://youtrack.jetbrains.com/projects/IJPL/issues/IJPL-239027/Feature-Support-Git-worktrees-in-multi-root-projects
[11] https://forum.sublimetext.com/t/how-to-add-multiple-repositories-in-folder-structure/44192
[12] https://community.spiceworks.com/t/inherited-permissions-removed-when-applying-explicit-permissions/754126
[13] https://github.com/microsoft/pylance-release/issues/159
[14] https://code.visualstudio.com/docs/reference/variables-reference
[15] https://www.levelaccess.com/blog/keyboard-navigation-complete-web-accessibility-guide/
[16] https://github.com/microsoft/vscode/issues/87237
[17] https://zed.dev/docs/reference/all-settings
[18] https://zed.dev/docs/project-panel.html
[19] https://forum.cursor.com/t/can-you-explain-how-to-create-multi-root-workspaces/92397
[20] https://uxdesign.cc/a-systematic-approach-for-managing-project-folder-structures-4e2e553cad00
[21] https://northflank.com/blog/github-codespaces-alternatives
[22] https://code.visualstudio.com/docs/editing/workspaces/workspaces
[23] https://www.nngroup.com/articles/confirmation-dialog/
[24] https://github.com/w3c/csswg-drafts/issues/8299
[25] https://git-scm.com/docs/git-worktree
[26] https://www.jetbrains.com/help/idea/project-settings-and-structure.html
[27] https://github.com/nuxt/nuxt/issues/30023
[28] https://github.com/warpdotdev/warp/issues/9098
[29] https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
[30] https://github.com/astral-sh/ruff-vscode/issues/654
[31] https://www.sublimetext.com/docs/menus.html
[32] https://forum.cursor.com/t/multi-root-workspace-with-local-remote-ssh-roots/146363
[33] https://feature-sliced.design/blog/frontend-monorepo-explained
[34] https://github.com/microsoft/vscode/issues/147173
[35] https://github.com/microsoft/vscode/issues/256984
[36] https://forums.sonarr.tv/t/root-folder-path-contains-series-folder/25861
[37] https://github.com/zed-industries/zed/issues/45555
[38] https://www.jetbrains.com/help/idea/creating-and-managing-modules.html
[39] https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-navigation/
[40] https://dev.to/rfornal/vs-code-collapse-and-expand-4710
[41] https://cursor.com/changelog
[42] https://youtrack.jetbrains.com/projects/WI/issues/WI-4678/renaming-project-directory-in-WebStorm-quirky
[43] https://forum.sublimetext.com/t/how-the-hell-do-projects-get-created-kept-separate/61123
[44] https://github.com/belgattitude/nextjs-monorepo-example
[45] https://pubmed.ncbi.nlm.nih.gov/35674090/
[46] https://learn.microsoft.com/en-us/answers/questions/2287432/(article)-restore-old-right-click-context-menu-in
[47] https://github.com/microsoft/vscode/issues/286040
[48] https://github.com/Microsoft/vscode/issues/16485
[49] https://code.visualstudio.com/updates/v1_110
[50] https://wezterm.org/config/lua/window-events/format-tab-title.html
