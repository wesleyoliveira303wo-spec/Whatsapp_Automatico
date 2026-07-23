export const meta = {
  name: 'create-feature',
  description: 'Guide the team through planning, implementation, testing, and documentation of a new feature.',
  phases: [{ title: 'Plan' }, { title: 'Implement' }, { title: 'Test' }, { title: 'Document' }, { title: 'Review' }],
};

// Phase: Plan
phase('Plan');
await agent('Gather requirements and constraints for the new feature. Identify impacted layers and data models.', { label: 'requirements', phase: 'Plan', schema: null });

// Phase: Implement
phase('Implement');
await agent('Generate implementation plan with file list, steps, and risk assessment.', { label: 'implementation-plan', phase: 'Implement' });
await agent('Write code files and edits as defined in the plan.', { label: 'code-generation', phase: 'Implement' });

// Phase: Test
phase('Test');
await agent('Create unit, integration, and e2e tests for the new feature.', { label: 'test-creation', phase: 'Test' });
await agent('Run the full test suite and ensure coverage thresholds are met.', { label: 'test-run', phase: 'Test' });

// Phase: Document
phase('Document');
await agent('Update API_SPECIFICATION.md, README sections, and relevant docs.', { label: 'doc-update', phase: 'Document' });

// Phase: Review
phase('Review');
await agent('Perform code review checklist, security review, and performance check.', { label: 'review', phase: 'Review' });

// Final step
await agent('Generate a summary report and create a PR with proper templates.', { label: 'summary', phase: 'Review' });
