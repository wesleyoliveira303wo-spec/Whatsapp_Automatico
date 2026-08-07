export const meta = {
name: 'create-component',
description: 'Workflow to create a new UI component following the design system and React standards.',
phases: [{title:'Design'},{title:'Implement'},{title:'Test'},{title:'Document'},{title:'Review'}]
};

phase('Design');
await agent('Define component purpose, props interface, state management, and design tokens.', {label:'design', phase:'Design'});

phase('Implement');
await agent('Create component file under src/frontend/components/, add storybook entry, export index.', {label:'implement', phase:'Implement'});

phase('Test');
await agent('Write component unit tests using React Testing Library.', {label:'test', phase:'Test'});

phase('Document');
await agent('Update docs/frontend/README with usage example and design guidelines.', {label:'doc', phase:'Document'});

phase('Review');
await agent('Run lint, accessibility audit, request code review.', {label:'review', phase:'Review'});

await agent('Create PR with appropriate template.', {label:'pr', phase:'Review'});
