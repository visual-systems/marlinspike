# Test PR Description

**Branch:** lyndon/test-pr-description
**Date:** 2026-03-07

## Context

The repo has a GitHub Actions workflow (`.github/workflows/update-pr-from-plan.yml`) that automatically updates PR descriptions from plan files in `PLANS/`. When a branch is pushed or a PR is opened, the workflow looks for a matching plan file and sets it as the PR body.

This branch tests that workflow end-to-end.

## Goal

Verify the full round-trip: plan file committed to branch → push → PR opened → workflow runs → PR description is populated from the plan file.

## Approach

1. Fill out this plan file with meaningful content
2. Commit and push the branch to GitHub
3. Manually open a PR
4. Observe the workflow run and confirm the PR description is updated

## Workflow Matching Logic

For branch `lyndon/test-pr-description`, the workflow extracts:
- `USER_SLUG=lyndon`
- `BRANCH_SLUG=test-pr-description`
- File pattern: `PLANS/*-lyndon-test-pr-description.md`
- Matched file: `PLANS/2026-03-07-lyndon-test-pr-description.md`

## Verification

- [ ] Workflow run shows "Matched plan file: PLANS/2026-03-07-lyndon-test-pr-description.md" in logs
- [ ] PR description matches the contents of this file
- [ ] No errors in the `gh pr edit` step
