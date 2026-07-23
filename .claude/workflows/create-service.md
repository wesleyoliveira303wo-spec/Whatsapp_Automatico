export const meta = {
  name: 'create-service',
  description: 'Workflow for implementing a new backend service layer component, including interface, implementation, tests, and docs.',
  phases: [{title:'Design'},{title:'Implement'},{title:'Test'},{title:'Document'},{title:'Review'}]
};

phase('Design');
await agent('Define service responsibilities, method signatures, dependencies, and error handling strategy.', {label:'design', phase:'Design'});

phase('Implement');
await agent('Create service interface and class in src/backend/services/, inject dependencies via DI container.', {label:'implement', phase:'Implement'});

phase('Test');
await agent('Write unit tests mocking dependencies, cover success and failure paths.', {label:'test', phase:'Test'});

phase('Document');
await agent('Update docs/backend/README with service description and usage example.', {label:'doc', phase:'Document'});

phase('Review');
await agent('Run lint, static analysis, and request code review.', {label:'review', phase:'Review'});

await agent('Create PR with appropriate template.', {label:'pr', phase:'Review'});