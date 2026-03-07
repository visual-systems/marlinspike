You are starting a new branch and plan for a piece of work.

## Step 1 — Get the branch name

If the user has not supplied a branch name with this command, ask them for one now before proceeding.

## Step 2 — Gather context

Run the following in parallel:
- `echo $USER` — to get the current system user
- `date +%Y-%m-%d` — to get today's date

## Step 3 — Sanitise

Produce a sanitised slug from the branch name:
- Lowercase
- Replace spaces and underscores with hyphens
- Remove any characters that are not alphanumeric or hyphens
- Collapse consecutive hyphens to one
- Trim leading/trailing hyphens

Use `$USER` directly as the user slug (it is already a valid slug).

## Step 4 — Create the branch

Run: `git checkout -b {user-slug}/{branch-slug}`

if the branch already exists - warn the user and ask if they want to simply check out the branch.

## Step 5 — Create the plan file

Create the file `PLANS/{date}-{user-slug}-{branch-slug}.md` with the following skeleton:

```markdown
# {Original branch name}

**Branch:** {user-slug}/{branch-slug}
**Date:** {date}

## Context
<!-- Why is this work being done? What problem does it solve? -->

## Goal
<!-- The intended outcome of this work. -->

## Approach
<!-- High level checklist for the steps in the implementation plan details below -->
<!-- Step-by-step implementation plan. -->

## Open Questions
<!-- Anything unresolved before or during implementation. -->

## Verification
<!-- How to confirm the work is complete and correct. -->
```

## Step 6 — Enter planning mode

Enter plan mode (`EnterPlanMode`) and begin researching and constructing the plan for this branch, writing your findings into the plan file you just created. Treat the plan file as the single source of truth for this piece of work.

When items are checked of or the plan progresses in a coherent step, prompt to make a commit.

As the plan is being developed and followed check off items from the `Approach` and `Verification` sections when appropriate. The end-goal of a `/branch` session should be to have a good plan and have all of the checklist items completed or reasons given why they won't be done now.