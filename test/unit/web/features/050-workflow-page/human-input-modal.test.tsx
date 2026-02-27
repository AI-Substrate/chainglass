import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HumanInputModal } from '@/features/050-workflow-page/components/human-input-modal';
import type { UserInputNodeStatus } from '@chainglass/positional-graph/interfaces';

type UserInputConfig = UserInputNodeStatus['userInput'];

const baseConfig: UserInputConfig = {
	prompt: 'Describe your requirements',
	inputType: 'text',
	outputName: 'requirements',
};

const singleConfig: UserInputConfig = {
	prompt: 'Choose a language',
	inputType: 'single',
	outputName: 'language',
	options: [
		{ key: 'ts', label: 'TypeScript' },
		{ key: 'py', label: 'Python' },
	],
};

const multiConfig: UserInputConfig = {
	prompt: 'Select features',
	inputType: 'multi',
	outputName: 'features',
	options: [
		{ key: 'auth', label: 'Authentication' },
		{ key: 'db', label: 'Database' },
		{ key: 'api', label: 'API' },
	],
};

const confirmConfig: UserInputConfig = {
	prompt: 'Proceed with deployment?',
	inputType: 'confirm',
	outputName: 'confirmed',
};

afterEach(() => cleanup());

describe('HumanInputModal', () => {
	it('renders text input for text type', () => {
		render(
			<HumanInputModal
				userInput={baseConfig}
				unitSlug="get-requirements"
				nodeId="n1"
				onSubmit={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByTestId('human-input-text')).toBeTruthy();
		expect(screen.getByText('Describe your requirements')).toBeTruthy();
	});

	it('renders radio buttons for single type', () => {
		render(
			<HumanInputModal
				userInput={singleConfig}
				unitSlug="pick-language"
				nodeId="n2"
				onSubmit={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByTestId('human-input-single')).toBeTruthy();
		expect(screen.getByText('TypeScript')).toBeTruthy();
		expect(screen.getByText('Python')).toBeTruthy();
	});

	it('renders checkboxes for multi type', () => {
		render(
			<HumanInputModal
				userInput={multiConfig}
				unitSlug="select-features"
				nodeId="n3"
				onSubmit={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByTestId('human-input-multi')).toBeTruthy();
		expect(screen.getByText('Authentication')).toBeTruthy();
		expect(screen.getByText('Database')).toBeTruthy();
	});

	it('renders yes/no buttons for confirm type', () => {
		render(
			<HumanInputModal
				userInput={confirmConfig}
				unitSlug="confirm-deploy"
				nodeId="n4"
				onSubmit={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByTestId('human-input-confirm')).toBeTruthy();
		expect(screen.getByText('Yes')).toBeTruthy();
		expect(screen.getByText('No')).toBeTruthy();
	});

	it('always shows freeform textarea', () => {
		render(
			<HumanInputModal
				userInput={confirmConfig}
				unitSlug="confirm-deploy"
				nodeId="n4"
				onSubmit={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByTestId('human-input-freeform')).toBeTruthy();
	});

	it('calls onClose on cancel without submitting', () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn();
		render(
			<HumanInputModal
				userInput={baseConfig}
				unitSlug="get-requirements"
				nodeId="n1"
				onSubmit={onSubmit}
				onClose={onClose}
			/>,
		);
		fireEvent.click(screen.getByText('Cancel'));
		expect(onClose).toHaveBeenCalledOnce();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('shows header with Human Input title and unit slug', () => {
		render(
			<HumanInputModal
				userInput={baseConfig}
				unitSlug="get-requirements"
				nodeId="n1"
				onSubmit={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByText('Human Input')).toBeTruthy();
		expect(screen.getByText('get-requirements')).toBeTruthy();
	});
});
