export const meta = {
  name: 'fix-bug',
  description: 'Process for reproducing, diagnosing, fixing, testing, and documenting a bug.',
  phases: [{title:'Reproduce'},{title:'Diagnose'},{title:'Fix'},{title:'Test'},{title:'Document'},{title:'Review'}]
};

phase('Reproduce');
await agent('Gather bug report details, reproduce steps, and capture failing test or log.', {label:'reproduce',phase:'Reproduce'});

phase('Diagnose');
await agent('Locate the source of the bug in the codebase, identify root cause.', {label:'diagnose',phase:'Diagnose'});

phase('Fix');
await agent('Propose minimal code change, apply using Edit tool, update related tests.', {label:'fix',phase:'Fix'});

phase('Test');
await agent('Run full test suite, ensure coverages, add regression test if needed.', {label:'test',phase:'Test'});

phase('Document');
await agent('Update CHANGELOG, add entry to bugfix checklist, reference bug ID.', {label:'doc',phase:'Document'});

phase('Review');
await agent('Perform security and performance checklist, request code review.', {label:'review',phase:'Review'});

await agent('Create PR with proper template and summary.', {label:'pr',phase:'Review'});
