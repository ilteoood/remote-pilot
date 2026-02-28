# Contributing to Remote Pilot

Thank you for considering contributing to Remote Pilot. Your help makes this project better for everyone.

## Prerequisites

To contribute to this project, you need the following tools:

*   Node.js >= 20
*   pnpm >= 10
*   VS Code

## Development Setup

Follow these steps to set up your local development environment:

1.  Fork and clone the repository.
2.  Run `pnpm install` to install dependencies.
3.  Run `pnpm build` to build all packages. Turborepo handles the build order automatically.
4.  Run `pnpm dev` to start all packages in watch mode.

## Project Structure

This project is a monorepo with the following layout:

```
packages/
  shared/     - TypeScript types and protocol definitions (tsc)
  server/     - Express + WebSocket relay server (tsup, ESM)
  extension/  - VS Code extension (tsup, CJS)
  web/        - React web UI (Vite)
```

The `shared` package is a dependency for all other packages. If you make changes to `shared`, you must rebuild the downstream packages.

## Available Scripts

| Script | Description |
| :--- | :--- |
| `pnpm build` | Build all packages in the monorepo |
| `pnpm dev` | Start watch mode for all packages |
| `pnpm clean` | Remove all dist folders from all packages |
| `pnpm --filter <pkg> build` | Build a specific package (e.g., `@remote-pilot/server`) |

## Code Style

We use strict TypeScript across the entire project.

*   Enable TypeScript strict mode.
*   Do not use `any` types.
*   Do not use `@ts-ignore`.

## Making Changes

1.  Create a new feature branch from `main`.
2.  Implement your changes.
3.  Ensure `pnpm build` passes without errors.
4.  Commit your changes with a descriptive message.
5.  Open a pull request against the `main` branch.

## Architecture Notes

*   The extension spawns the server as a child process using the Node.js `fork()` method.
*   Communication between components uses the WebSocket protocol defined in `@remote-pilot/shared`.
*   The server functions as a relay. It does not process chat data, it only forwards messages between clients.
*   The extension reads VS Code's internal chat storage directly from the disk.
*   The Express server serves the web UI as static files.

## Adding New Message Types

To add a new message type to the communication protocol:

1.  Add the type to the `WsMessageType` union in `packages/shared/src/index.ts`.
2.  Add the corresponding payload interface to the `WsMessageDataMap`.
3.  Handle the new message type in the relevant packages.
4.  Run `pnpm build` to update all dependencies.

## Reporting Issues

Use GitHub issues to report bugs or suggest features. When reporting a bug, include:

*   Your VS Code version.
*   Your operating system.
*   Clear steps to reproduce the issue.

## License

By contributing to Remote Pilot, you agree that your contributions will be licensed under the MIT License.
