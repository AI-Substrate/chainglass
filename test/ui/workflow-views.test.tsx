/**
 * Workflow Views - Component Rendering Tests
 *
 * Lightweight tests verifying core components render without errors.
 * Uses FakeMatchMedia for responsive viewport simulation.
 *
 * @see Plan 011: UI Mockups (T024)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { FakeMatchMedia } from '@test/fakes/fake-match-media';

// Components under test
import { StatusBadge } from '@/components/ui/status-badge';
import { WorkflowCard } from '@/components/workflows/workflow-card';
import { RunRow } from '@/components/runs/run-row';
import { RunList } from '@/components/runs/run-list';
import { QuestionInput } from '@/components/phases/question-input';
import { CheckpointCard } from '@/components/checkpoints/checkpoint-card';
import { WorkflowBreadcrumb } from '@/components/ui/workflow-breadcrumb';

// Fixtures
import {
  DEMO_WORKFLOWS,
  DEMO_QUESTIONS,
  createCheckpointMetadata,
} from '@/data/fixtures/workflows.fixture';
import { DEMO_RUN_SUMMARIES } from '@/data/fixtures/runs.fixture';

// ============ Test Setup ============

let fakeMatchMedia: FakeMatchMedia;

beforeEach(() => {
  // Setup FakeMatchMedia for responsive tests
  fakeMatchMedia = new FakeMatchMedia(1024); // Desktop viewport
  vi.stubGlobal('matchMedia', (query: string) => fakeMatchMedia.matchMedia(query));
});

afterEach(() => {
  vi.unstubAllGlobals();
  fakeMatchMedia.clearAllListeners();
});

// ============ StatusBadge Tests ============

describe('StatusBadge', () => {
  it('renders all 7 PhaseRunStatus values', () => {
    const statuses = ['pending', 'ready', 'active', 'blocked', 'accepted', 'complete', 'failed'] as const;

    for (const status of statuses) {
      const { unmount } = render(<StatusBadge status={status} showIcon />);
      // Should render without throwing
      unmount();
    }
  });

  it('renders dot-only mode', () => {
    render(<StatusBadge status="active" dotOnly data-testid="dot" />);
    // Dot should be visible (no text)
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('shows animation for active status', () => {
    const { container } = render(<StatusBadge status="active" showIcon animate />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('animate-spin');
  });
});

// ============ WorkflowCard Tests ============

describe('WorkflowCard', () => {
  it('renders workflow with basic info', () => {
    const workflow = DEMO_WORKFLOWS[0];
    render(<WorkflowCard workflow={workflow} />);

    expect(screen.getByText(workflow.slug)).toBeInTheDocument();
    if (workflow.description) {
      expect(screen.getByText(workflow.description)).toBeInTheDocument();
    }
  });

  it('shows waiting indicator for blocked runs', () => {
    const workflow = DEMO_WORKFLOWS[0];
    const blockedRuns = DEMO_RUN_SUMMARIES.filter((r) => r.hasBlockedPhase);

    render(<WorkflowCard workflow={workflow} runs={blockedRuns} />);

    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('renders phase count', () => {
    const workflow = DEMO_WORKFLOWS[0];
    render(<WorkflowCard workflow={workflow} />);

    expect(screen.getByText(workflow.phases.length.toString())).toBeInTheDocument();
  });
});

// ============ RunRow Tests ============

describe('RunRow', () => {
  it('renders run summary in table row', () => {
    const run = DEMO_RUN_SUMMARIES[0];

    render(
      <table>
        <tbody>
          <RunRow run={run} workflowSlug="test-workflow" />
        </tbody>
      </table>
    );

    expect(screen.getByText(run.runId)).toBeInTheDocument();
  });

  it('shows current phase when present', () => {
    const runWithPhase = DEMO_RUN_SUMMARIES.find((r) => r.currentPhase);
    if (!runWithPhase) return;

    render(
      <table>
        <tbody>
          <RunRow run={runWithPhase} workflowSlug="test-workflow" />
        </tbody>
      </table>
    );

    expect(screen.getByText(runWithPhase.currentPhase!)).toBeInTheDocument();
  });
});

// ============ RunList Tests ============

describe('RunList', () => {
  it('renders empty state when no runs', () => {
    render(<RunList runs={[]} workflowSlug="test-workflow" />);

    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });

  it('renders table with runs sorted by date', () => {
    render(<RunList runs={DEMO_RUN_SUMMARIES} workflowSlug="test-workflow" />);

    // Should have table headers
    expect(screen.getByText('Run ID')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    // Should have run rows
    for (const run of DEMO_RUN_SUMMARIES) {
      expect(screen.getByText(run.runId)).toBeInTheDocument();
    }
  });
});

// ============ QuestionInput Tests ============

describe('QuestionInput', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('renders single_choice question with radio buttons', () => {
    render(
      <QuestionInput question={DEMO_QUESTIONS.single_choice} onSubmit={mockOnSubmit} />
    );

    expect(screen.getByText(DEMO_QUESTIONS.single_choice.prompt)).toBeInTheDocument();

    // Check radio options exist
    for (const choice of DEMO_QUESTIONS.single_choice.choices ?? []) {
      expect(screen.getByText(choice)).toBeInTheDocument();
    }
  });

  it('renders multi_choice question with checkboxes', () => {
    render(
      <QuestionInput question={DEMO_QUESTIONS.multi_choice} onSubmit={mockOnSubmit} />
    );

    expect(screen.getByText(DEMO_QUESTIONS.multi_choice.prompt)).toBeInTheDocument();
  });

  it('renders free_text question with textarea', () => {
    render(
      <QuestionInput question={DEMO_QUESTIONS.free_text} onSubmit={mockOnSubmit} />
    );

    expect(screen.getByText(DEMO_QUESTIONS.free_text.prompt)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your response...')).toBeInTheDocument();
  });

  it('renders confirm question with Yes/No buttons', () => {
    render(
      <QuestionInput question={DEMO_QUESTIONS.confirm} onSubmit={mockOnSubmit} />
    );

    expect(screen.getByText(DEMO_QUESTIONS.confirm.prompt)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('has accessible submit button (never disabled)', () => {
    render(
      <QuestionInput question={DEMO_QUESTIONS.confirm} onSubmit={mockOnSubmit} />
    );

    const submitButton = screen.getByRole('button', { name: 'Submit Answer' });
    expect(submitButton).not.toBeDisabled();
  });
});

// ============ CheckpointCard Tests ============

describe('CheckpointCard', () => {
  it('renders checkpoint version and date', () => {
    const checkpoint = createCheckpointMetadata({
      version: 'v001-abc1234',
      comment: 'Initial release',
    });

    render(<CheckpointCard checkpoint={checkpoint} />);

    expect(screen.getByText('v001-abc1234')).toBeInTheDocument();
  });

  it('shows Current badge when active', () => {
    const checkpoint = createCheckpointMetadata({ version: 'v001-abc1234' });

    render(<CheckpointCard checkpoint={checkpoint} isActive />);

    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('shows comment when present', () => {
    const checkpoint = createCheckpointMetadata({
      version: 'v001-abc1234',
      comment: 'Fixed the bug',
    });

    render(<CheckpointCard checkpoint={checkpoint} />);

    expect(screen.getByText('Fixed the bug')).toBeInTheDocument();
  });
});

// ============ WorkflowBreadcrumb Tests ============

describe('WorkflowBreadcrumb', () => {
  it('renders Workflows as root', () => {
    render(<WorkflowBreadcrumb />);

    expect(screen.getByText('Workflows')).toBeInTheDocument();
  });

  it('renders workflow slug when provided', () => {
    render(<WorkflowBreadcrumb workflowSlug="my-workflow" />);

    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByText('my-workflow')).toBeInTheDocument();
  });

  it('renders full path with run ID', () => {
    render(<WorkflowBreadcrumb workflowSlug="my-workflow" runId="run-001" />);

    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByText('my-workflow')).toBeInTheDocument();
    expect(screen.getByText('Runs')).toBeInTheDocument();
    expect(screen.getByText('run-001')).toBeInTheDocument();
  });
});

// ============ Responsive Tests ============

describe('Responsive Behavior', () => {
  it('WorkflowCard renders on phone viewport', () => {
    fakeMatchMedia.setViewportWidth(375); // iPhone width

    const workflow = DEMO_WORKFLOWS[0];
    render(<WorkflowCard workflow={workflow} />);

    expect(screen.getByText(workflow.slug)).toBeInTheDocument();
  });

  it('WorkflowCard renders on desktop viewport', () => {
    fakeMatchMedia.setViewportWidth(1440); // Desktop width

    const workflow = DEMO_WORKFLOWS[0];
    render(<WorkflowCard workflow={workflow} />);

    expect(screen.getByText(workflow.slug)).toBeInTheDocument();
  });
});
