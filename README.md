# Freestyle PKG Template

### **Structure**

The repository is organized as follows:

-   `packages/`: Contains all the individual packages of the monorepo.
-   `asset/`: Contains assets and documentation.
-   Configuration files (e.g., `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`) are located at the root level.

---

### **Tooling**

This monorepo uses the following tools:

| Tool        | Purpose                               |
| :---------- | :------------------------------------ |
| **pnpm**    | Dependency management                 |
| **Turborepo** | High-performance build system         |
| **Changesets**| Versioning and changelog generation |
| **TypeScript**| Language for type-safe code         |
| **Vitest**    | Fast unit testing framework         |

---

### **Getting Started**

1.  **Install pnpm:**
    ```bash
    npm install -g pnpm
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

---

### **Development**

| Command           | Description                                     |
| :---------------- | :---------------------------------------------- |
| `pnpm dev`        | Start development servers for all packages.     |
| `pnpm build`      | Build all packages.                             |
| `pnpm test`       | Run tests for all packages.                     |
| `pnpm lint`       | Lint all packages.                              |
| `pnpm clean`      | Clean all build artifacts and `node_modules`.   |

---

### **Versioning**

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning and publishing.

| Command           | Description                                                              |
| :---------------- | :----------------------------------------------------------------------- |
| `pnpm pkg:init`   | Create a new changeset. This will prompt you for the type of change.     |
| `pnpm pkg:version`| Apply changesets and bump package versions.                              |
| `pnpm pkg:publish`| Publish packages to the registry.                                        |
