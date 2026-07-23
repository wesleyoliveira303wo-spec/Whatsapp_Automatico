export const meta = {
  name: 'create-page',
  description: 'Workflow for adding a new Next.js page, including routing, data fetching, UI, tests, and docs.',
  phases: [{title:'Design'},{title:'Implement'},{title:'Test'},{title:'Document'},{title:'Review'}]
};

phase('Design');
await agent('Define page route, purpose, required data (SSR/SSG), and UI mockups.', {label:'design', phase:'Design'});

phase('Implement');
await agent('Create page file under src/frontend/pages/, implement getServerSideProps or getStaticProps, UI components.', {label:'implement', phase:'Implement'});

phase('Test');
await agent('Write integration tests using Playwright for page navigation and functionality.', {label:'test', phase:'Test'});

phase('Document');
await agent('Add page description to docs/frontend/README and update navigation links.', {label:'doc', phase:'Document'});

phase('Review');
await agent('Run lint, accessibility checks, and request code review.', {label:'review', phase:'Review'});

await agent('Create PR with proper template.', {label:'pr', phase:'Review'});