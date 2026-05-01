import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDocumentStore } from '../../app/stores/documentStore';
import { useUiStore } from '../../app/stores/uiStore';
import { EditorRoute } from './EditorRoute';

describe('editor shell', () => {
  beforeEach(() => {
    useDocumentStore.getState().reset();
    useUiStore.setState({
      selectedNodeIds: ['digital-onboarding'],
      outlineOpen: true,
      inspectorOpen: true,
      activeDrawer: null,
      exportFormat: 'json',
      inspectorTab: 'inspector',
      searchQuery: ''
    });
  });

  it('renders the fixed workspace regions', () => {
    render(<EditorRoute />);
    expect(screen.getByText('Capability Canvas')).toBeInTheDocument();
    expect(screen.getByText('Outline')).toBeInTheDocument();
    expect(screen.getAllByText('Inspector').length).toBeGreaterThan(0);
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
  });

  it('shows heatmap scores only in heatmap mode', async () => {
    render(<EditorRoute />);
    const canvas = screen.getByTestId('canvas');
    expect(within(canvas).queryByText('0.72')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Heatmap' }));
    expect(within(canvas).getByText('0.72')).toBeInTheDocument();
  });

  it('opens settings and keeps parent canvas labels free of swatches', async () => {
    const { container } = render(<EditorRoute />);
    expect(container.querySelector('.cc-canvas .cc-node-title .cc-tree-swatch')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('complementary', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Layout mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Show grid')).toBeChecked();
  });

  it('collapses and restores the outline from the rail', async () => {
    render(<EditorRoute />);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse outline' }));
    expect(screen.queryByText('Outline')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Toggle outline' }));
    expect(screen.getByText('Outline')).toBeInTheDocument();
  });

  it('collapses and restores the inspector even with no selection', async () => {
    useUiStore.setState({ selectedNodeIds: [] });
    render(<EditorRoute />);
    expect(screen.getByText('Select a capability to edit its properties.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }));
    expect(screen.queryByText('Inspector')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Toggle inspector' }));
    expect(screen.getAllByText('Inspector').length).toBeGreaterThan(0);
  });

  it('switches settings and export drawers from the rail', async () => {
    render(<EditorRoute />);
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('complementary', { name: 'Settings' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open export' }));
    expect(screen.queryByRole('complementary', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Export' })).toBeInTheDocument();
  });

  it('renders canvas padding controls and applies layout explicitly', async () => {
    render(<EditorRoute />);
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    const topPadding = screen.getByLabelText('Top');
    await userEvent.clear(topPadding);
    await userEvent.type(topPadding, '48');

    expect(useDocumentStore.getState().doc.settings.containerPaddingTop).toBe(48);
    expect(screen.getByLabelText('Horizontal')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply auto layout' }));
    expect(useDocumentStore.getState().past.at(-1)?.label).toBe('Auto layout');
  });

  it('opens outline row actions from the three-dot menu', async () => {
    const { container } = render(<EditorRoute />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Customer' }));

    const menu = screen.getByRole('menu', { name: 'Capability actions' });
    expect(within(menu).getByRole('menuitem', { name: 'Add child' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Fit parent' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();

    const outlineTree = container.querySelector('.cc-outline-tree') as HTMLElement;
    const before = within(outlineTree).queryAllByText('New capability').length;
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Add child' }));
    expect(within(outlineTree).queryAllByText('New capability')).toHaveLength(before + 1);
  });
});
