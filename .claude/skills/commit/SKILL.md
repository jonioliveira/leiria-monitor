---
name: commit
description: "Create atomic git commits using conventional commit format. Analyzes changes, splits into logical units, and writes clean commit messages. Never mentions AI."
---

Create a commit for the current staged and unstaged changes following these rules strictly:

## Process

1. Run `git status` and `git diff` (staged + unstaged) to understand all changes.
2. Run `git log --oneline -5` to see recent commit style for context.
3. Analyze the changes and determine if they should be split into multiple atomic commits.
4. For each atomic commit:
   - Stage only the related files using `git add <specific files>` (never `git add .` or `git add -A`)
   - Write a commit message following the format below
   - Create the commit
5. After all commits, run `git status` to confirm a clean working tree.

## Atomic Commit Rules

- Each commit must represent ONE logical change (one feature, one fix, one refactor, etc.)
- If changes span multiple concerns (e.g., a bug fix AND a formatting change), split them into separate commits
- Order commits logically: infrastructure/schema first, then logic, then UI, then tests
- When in doubt, prefer smaller commits over larger ones

## Conventional Commit Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types (use exactly these)
- `feat` - new feature or capability
- `fix` - bug fix
- `refactor` - code change that neither fixes a bug nor adds a feature
- `style` - formatting, whitespace, missing semicolons (no code logic change)
- `perf` - performance improvement
- `test` - adding or updating tests
- `docs` - documentation only
- `build` - build system or external dependencies
- `ci` - CI/CD configuration
- `chore` - maintenance tasks, tooling, config

### Scope
- Use the most relevant module/area: `api`, `web`, `auth`, `games`, `ui`, `db`, `i18n`, etc.
- Keep it short (1-2 words)

### Subject line
- Lowercase, imperative mood ("add" not "added" or "adds")
- No period at the end
- Max 72 characters total (type + scope + subject)
- Describe WHAT changed and WHY if not obvious

### Body (when needed)
- Wrap at 72 characters
- Explain motivation for the change if not obvious from the subject
- Use bullet points for multiple related changes within the same concern

### Footer
- Reference issues: `Closes #123` or `Fixes #123`
- Note breaking changes: `BREAKING CHANGE: description`

## Strictly Forbidden

- Never include `Co-Authored-By` lines
- Never mention AI, Claude, LLM, assistant, copilot, or any AI tool
- Never use `git add .` or `git add -A`
- Never amend existing commits unless explicitly asked
- Never skip pre-commit hooks (`--no-verify`)

## Examples

```
feat(games): add skill-based matchmaking filter

Players can now filter games by skill level range,
showing only games where they meet the eligibility criteria.

Closes #34
```

```
fix(ui): improve form error contrast for WCAG AA compliance

- Change error text from red-600 to red-800 on red-50 backgrounds
- Add dark mode classes for error messages across all forms
```

```
refactor(api): extract transaction helper from repository layer
```
