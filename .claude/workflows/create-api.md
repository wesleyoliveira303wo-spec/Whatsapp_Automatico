export const meta = {
  name: 'create-api',
  description: 'Workflow for adding a new REST/GraphQL endpoint, including OpenAPI spec, implementation, tests, and documentation.',
  phases: [{title:'Design'},{title:'Implement'},{title:'Test'},{title:'Document'},{title:'Review'}]
};

phase('Design');
await agent('Define API contract, request/response schemas, authentication requirements.', {label:'design',phase:'Design'});

phase('Implement');
await agent('Create controller/service files, add route registration, update OpenAPI spec.', {label:'implementation',phase:'Implement'});

phase('Test');
await agent('Write unit tests for service logic and integration tests for the endpoint.', {label:'testing',phase:'Test'});

phase('Document');
await agent('Update API_SPECIFICATION.md with new endpoint details, add examples.', {label:'docs',phase:'Document'});

phase('Review');
await agent('Run security checklist, performance check, and request code review.', {label:'review',phase:'Review'});

await agent('Create PR with proper template and summary.', {label:'pr',phase:'Review'});
