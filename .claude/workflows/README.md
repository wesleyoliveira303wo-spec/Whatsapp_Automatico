# Claude Workflows

This directory contains reusable workflow scripts that orchestrate multiple agents or background tasks. Workflows are written in JavaScript and executed via the `/workflow` tool. Each script must export a `meta` object describing its name, description, and optional phases.

Example structure:

```js
export const meta = {
  name: 'run-tests',
  description: 'Run the full test suite and report results',
  phases: [{ title: 'Testing' }],
};

// workflow body
await agent('Run unit tests', { label: 'unit-tests' });
await agent('Run integration tests', { label: 'integration-tests' });
```
