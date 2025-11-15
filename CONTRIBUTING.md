# Contributing

Thanks for your interest in contributing to Freestyle Engineering. We're happy to have you here.

Please take a moment to review this document before submitting your first pull request. We also strongly recommend that you check for open issues and pull requests to see if someone else is working on something similar.

If you need any help, feel free to reach out to us by opening an issue.

## About this repository

This repository is a monorepo.

- We use [pnpm](https://pnpm.io) and [`workspaces`](https://pnpm.io/workspaces) for development.
- We use [Turborepo](https://turbo.build/repo) as our build system.
- We use [changesets](https://github.com/changesets/changesets) for managing releases.

## Structure

This repository is structured as follows:

```
packages
├── core
├── react
├── solid
├── svelte
├── vue
└── web
```

| Path | Description |
| --- | --- |
| `packages/core` | The core animation engine. |
| `packages/react` | `React` hooks and components for the animation engine. |
| `packages/solid` | `SolidJS` utilities for the animation engine. |
| `packages/svelte` | `Svelte` utilities for the animation engine. |
| `packages/vue` | `Vue` composables for the animation engine. |
| `packages/web` | The `Next.js` application for the documentation website. |

## Development

### Fork this repo

You can fork this repo by clicking the fork button in the top right corner of this page.

### Clone on your local machine

```bash
git clone https://github.com/freestylejs/ani.git
```

### Navigate to project directory

```bash
cd {ani}
```

### Create a new Branch

```bash
git checkout -b {new-branch}
```

### Install dependencies

```bash
pnpm install
```

### Start development

```bash
pnpm dev
```

#### Run a workspace

You can use the `pnpm --filter=[WORKSPACE]` command to start the development process for a workspace.

> Examples

1. To run the documentation website:

```bash
pnpm --filter=@freestylejs/ani-web dev
```

2. To work on the core package in watch mode:

```bash
pnpm --filter=@freestylejs/ani-core dev
```

## Documentation

The documentation for this project is located in the `web` workspace. You can run the documentation locally by running the following command:

```bash
pnpm --filter=@freestylejs/ani-web dev
```

Documentation is written using [MDX](https://mdxjs.com). You can find the documentation files in the `packages/web/content/docs` directory.

## Commit Convention

Check [commit convention](./assets/commit.md).

## Testing

Tests are written using [Vitest](https://vitest.dev). You can run all the tests from the root of the repository.

```bash
pnpm test
```

Please ensure that the tests are passing when submitting a pull request. If you're adding new features, please include tests.
