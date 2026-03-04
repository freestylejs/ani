---
title: Professional Git Commitment Methodology for AI Agents
objective: The goal of this methodology is to maintain a clean, traceable, and modular repository history. The Agent must ensure that every commit represents a single logical unit of work, facilitating easier code reviews and rollbacks.
reference: [./commit.md]
---

## Core Principles & Ruleset

### Rule 1: Atomic & Module-Based Commits

Commits must be partitioned by **logical modules** or **functional contexts**.

* **Definition:** A single commit should address one specific concern (e.g., a feature, a bug fix, or a refactoring of a specific component).
* **Contextual Relation:** If a change in `Module A` necessitates a change in `Module B` to function, they may be grouped. However, unrelated changes must be separated into distinct commits.

### Rule 2: Prohibition of `git add .`

The Agent is strictly forbidden from using global staging commands.

* **Forbidden:** `git add .`, `git add -A`, `git add *`
* **Required:** Use specific file paths (e.g., `git add path/to/file.py`).
* **Reasoning:** Global adding leads to "polluted" commits containing temporary files, logs, or unrelated changes that violate Rule 1.

### Rule 3: Selective Staging via Dependency Analysis

Before staging, the Agent must analyze the dependency of the modified files.

* **Step 1:** Run `git status` and `git diff` to identify all changed files.
* **Step 2:** Group files based on their functional impact.
* **Step 3:** Stage only the files belonging to the specific module being committed.

### Rule 4: Sequential Commit Execution

If multiple modules are modified, the Agent must execute the commit process sequentially:

1. Stage files for **Module A**.
2. Commit with the pre-defined message format.
3. Stage files for **Module B**.
4. Commit with the pre-defined message format.

---

## 3. Standard Workflow (Step-by-Step)

| Step | Action | Command/Description |
| --- | --- | --- |
| **1. Scan** | Identify modified files | `git status` |
| **2. Analyze** | Determine the logical boundary | Group files by functional context (e.g., UI, Backend, Logic). |
| **3. Stage** | Add files selectively | `git add <file1> <file2>` |
| **4. Verify** | Check staged changes | `git diff --staged` (Ensure no unrelated code is included). |
| **5. Commit** | Apply pre-defined format | `git commit -m "<Structured_Message>"` |

---

## 4. Exception Handling

* **Cross-cutting Concerns:** If a change affects the entire system (e.g., renaming a core variable), the Agent may group these changes but must clearly state the "Global" scope in the commit message.
* **Unstaged Changes:** Any files left unstaged after the primary task must be evaluated for a secondary commit or discarded if they are artifacts/junk.

> **Important Note for Agent:**
> "Always prioritize the **'Why'** of the change over the **'What'**. If a file change does not directly contribute to the specific goal of the current module, it belongs in a different commit."
