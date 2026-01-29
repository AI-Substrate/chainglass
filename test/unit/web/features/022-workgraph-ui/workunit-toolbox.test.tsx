/**
 * WorkUnitToolbox Component Tests - Phase 3 (T001)
 *
 * TDD tests for the WorkUnitToolbox component.
 * Tests cover: unit listing, drag data format, grouping by type.
 *
 * These tests should FAIL initially until T002 (API) and T003 (component) are implemented.
 *
 * Per Constitution Principle 4: Using vi.fn() for fetch mock, not MSW.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Component will be created in T003
import { WorkUnitToolbox } from '@/features/022-workgraph-ui/workunit-toolbox';

// ============================================
// Test Data
// ============================================

const mockUnits = [
  { slug: 'sample-coder', type: 'agent', version: '1.0.0', description: 'Sample coder agent' },
  { slug: 'sample-tester', type: 'agent', version: '1.0.0', description: 'Sample tester agent' },
  { slug: 'sample-input', type: 'user-input', version: '1.0.0', description: 'User input unit' },
  { slug: 'sample-transform', type: 'code', version: '1.0.0', description: 'Code transform unit' },
];

// ============================================
// Fetch Mock Setup
// ============================================

const mockFetch = vi.fn();

beforeEach(() => {
  // Reset fetch mock
  mockFetch.mockReset();
  // Default success response
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ units: mockUnits, errors: [] }),
  });
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================
// Tests: Unit Listing
// ============================================

describe('WorkUnitToolbox', () => {
  describe('Unit Listing', () => {
    it('should fetch and display available units', async () => {
      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      // Wait for units to load
      await waitFor(() => {
        expect(screen.getByText('sample-coder')).toBeInTheDocument();
      });

      // All units should be displayed
      expect(screen.getByText('sample-tester')).toBeInTheDocument();
      expect(screen.getByText('sample-input')).toBeInTheDocument();
      expect(screen.getByText('sample-transform')).toBeInTheDocument();

      // Verify the API was called with correct URL (full URL in jsdom)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/workspaces/test-workspace/units')
      );
    });

    it('should show loading state while fetching units', async () => {
      // Delay the response
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ units: mockUnits, errors: [] }),
                }),
              100
            )
          )
      );

      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      // Should show loading indicator initially
      expect(screen.getByTestId('toolbox-loading')).toBeInTheDocument();

      // Loading should disappear after fetch
      await waitFor(() => {
        expect(screen.queryByTestId('toolbox-loading')).not.toBeInTheDocument();
      });
    });

    it('should show error state when API fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          units: [],
          errors: [{ code: 'E100', message: 'Failed to load units' }],
        }),
      });

      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      await waitFor(() => {
        expect(screen.getByTestId('toolbox-error')).toBeInTheDocument();
      });
    });

    it('should show empty state when no units available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ units: [], errors: [] }),
      });

      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      await waitFor(() => {
        expect(screen.getByTestId('toolbox-empty')).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Tests: Grouping by Type
  // ============================================

  describe('Grouping by Type', () => {
    it('should group units by their type', async () => {
      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      await waitFor(() => {
        expect(screen.getByText('sample-coder')).toBeInTheDocument();
      });

      // Should have group headers for each type
      expect(screen.getByTestId('group-agent')).toBeInTheDocument();
      expect(screen.getByTestId('group-user-input')).toBeInTheDocument();
      expect(screen.getByTestId('group-code')).toBeInTheDocument();
    });

    it('should display units under correct group', async () => {
      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      await waitFor(() => {
        expect(screen.getByText('sample-coder')).toBeInTheDocument();
      });

      // Find the agent group and verify it contains agent units
      const agentGroup = screen.getByTestId('group-agent');
      expect(within(agentGroup).getByText('sample-coder')).toBeInTheDocument();
      expect(within(agentGroup).getByText('sample-tester')).toBeInTheDocument();

      // Find the user-input group
      const inputGroup = screen.getByTestId('group-user-input');
      expect(within(inputGroup).getByText('sample-input')).toBeInTheDocument();

      // Find the code group
      const codeGroup = screen.getByTestId('group-code');
      expect(within(codeGroup).getByText('sample-transform')).toBeInTheDocument();
    });
  });

  // ============================================
  // Tests: Drag Data Format
  // ============================================

  describe('Drag Data Format', () => {
    it('should set drag data on drag start', async () => {
      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      await waitFor(() => {
        expect(screen.getByText('sample-coder')).toBeInTheDocument();
      });

      // Find the draggable unit item
      const unitItem = screen.getByTestId('unit-item-sample-coder');

      // Create a mock dataTransfer object
      const mockSetData = vi.fn();
      const dataTransfer = {
        setData: mockSetData,
        effectAllowed: '',
      };

      // Simulate drag start using fireEvent
      fireEvent.dragStart(unitItem, { dataTransfer });

      // Verify the drag data was set correctly
      expect(mockSetData).toHaveBeenCalledWith(
        'application/workgraph-unit',
        JSON.stringify({
          unitSlug: 'sample-coder',
          unitType: 'agent',
        })
      );
    });

    it('should have draggable attribute on unit items', async () => {
      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      await waitFor(() => {
        expect(screen.getByText('sample-coder')).toBeInTheDocument();
      });

      const unitItem = screen.getByTestId('unit-item-sample-coder');
      expect(unitItem).toHaveAttribute('draggable', 'true');
    });
  });

  // ============================================
  // Tests: Accessibility
  // ============================================

  describe('Accessibility', () => {
    it('should have accessible section element for toolbox', async () => {
      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      await waitFor(() => {
        expect(screen.getByText('sample-coder')).toBeInTheDocument();
      });

      const toolbox = screen.getByTestId('workunit-toolbox');
      // Using <section> element which has implicit role="region" with aria-label
      expect(toolbox.tagName.toLowerCase()).toBe('section');
      expect(toolbox).toHaveAttribute('aria-label', 'WorkUnit Toolbox');
    });

    it('should have accessible unit descriptions', async () => {
      render(<WorkUnitToolbox workspaceSlug="test-workspace" />);

      await waitFor(() => {
        expect(screen.getByText('sample-coder')).toBeInTheDocument();
      });

      // Description should be visible or accessible
      expect(screen.getByText('Sample coder agent')).toBeInTheDocument();
    });
  });
});
