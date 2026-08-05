# Git workflow demo (temporary — safe to delete)

This file exists purely as a hands-on walkthrough of the branch → commit →
push → pull request → review → merge flow this repo uses. It carries no real
content and should be deleted (in its own follow-up PR) once it's served its
purpose.

## The flow, step by step

1. **Branch fresh off `main`.** `git fetch origin main` to get the latest,
   then `git checkout -b <branch-name> origin/main` — never branch off an old
   named branch, since it may be stale or already merged-and-abandoned (see
   `docs/HANDOFF.md`'s "Repo & branch" section for why that matters here).
2. **Make the change.** This file is the change — one small, self-contained
   commit is easier to review than a pile of unrelated edits.
3. **Commit with a clear message** that explains *why*, not just *what* (the
   diff already shows what changed).
4. **Push the branch** to the remote: `git push -u origin <branch-name>`.
   The `-u` sets up tracking so future `git push`/`git pull` on this branch
   don't need the remote name repeated.
5. **Open a pull request** from the branch into `main`. This is the review
   checkpoint — CI runs, a human (or another agent) can comment, and nothing
   lands in `main` until it's approved.
6. **Merge — manually, by a human.** This PR is intentionally left unmerged
   so the repo owner can merge it themselves and see that last step happen
   under their own hand, not automatically.

## What this demo deliberately does not cover

Rebasing, resolving merge conflicts, squash-vs-merge-commit strategy, and
force-pushing are all real parts of a git workflow but are a separate lesson
— this file sticks to the straight-line happy path.
