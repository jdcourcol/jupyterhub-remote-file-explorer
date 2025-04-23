import * as assert from 'assert';
import * as vscode from 'vscode';
import { JupyterHubConnection } from '../jupyterHub/jupyterHubConnection';
import { FileEntry, JupyterHubTreeDataProvider } from '../jupyterHub/jupyterHubExplorer';

// Mock vscode namespace
jest.mock('vscode', () => {
    return {
        EventEmitter: jest.fn().mockImplementation(() => ({
            event: jest.fn(),
            fire: jest.fn()
        })),
        TreeItem: jest.fn().mockImplementation((label, collapsibleState) => ({
            label,
            collapsibleState,
            iconPath: undefined,
            contextValue: undefined,
            description: undefined,
            tooltip: undefined,
            command: undefined
        })),
        TreeItemCollapsibleState: {
            None: 0,
            Collapsed: 1,
            Expanded: 2
        },
        ThemeIcon: jest.fn().mockImplementation((id) => ({ id })),
        Uri: {
            parse: jest.fn().mockImplementation((uri) => ({ uri }))
        },
        window: {
            showWarningMessage: jest.fn(),
            showErrorMessage: jest.fn()
        }
    };
});

// Mock JupyterHubConnection
jest.mock('../jupyterHub/jupyterHubConnection');

describe('JupyterHubTreeDataProvider', () => {
    let connection: jest.Mocked<JupyterHubConnection>;
    let treeDataProvider: JupyterHubTreeDataProvider;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Setup mock connection
        connection = new JupyterHubConnection({
            serverUrl: '',
            token: '',
            username: ''
        }) as jest.Mocked<JupyterHubConnection>;
        connection.isActive = jest.fn().mockReturnValue(true);
        connection.listContents = jest.fn();
        
        // Create tree data provider
        treeDataProvider = new JupyterHubTreeDataProvider(connection);
    });
    
    describe('getTreeItem', () => {
        it('should create tree item for directory', () => {
            const fileEntry: FileEntry = {
                name: 'test-dir',
                path: '/test-dir',
                type: 'directory'
            };
            
            const treeItem = treeDataProvider.getTreeItem(fileEntry);
            
            expect(treeItem.label).toBe('test-dir');
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
            expect(treeItem.iconPath).toEqual(new vscode.ThemeIcon('folder'));
            expect(treeItem.contextValue).toBe('directory');
            expect(treeItem.tooltip).toBe('/test-dir');
            expect(treeItem.command).toBeUndefined();
        });
        
        it('should create tree item for file', () => {
            const fileEntry: FileEntry = {
                name: 'test-file.txt',
                path: '/test-file.txt',
                type: 'file'
            };
            
            const treeItem = treeDataProvider.getTreeItem(fileEntry);
            
            expect(treeItem.label).toBe('test-file.txt');
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
            expect(treeItem.iconPath).toEqual(new vscode.ThemeIcon('file'));
            expect(treeItem.contextValue).toBe('file');
            expect(treeItem.tooltip).toBe('/test-file.txt');
            expect(treeItem.command).toBeDefined();
            expect(treeItem.command?.command).toBe('vscode.open');
        });
        
        it('should create tree item for notebook', () => {
            const fileEntry: FileEntry = {
                name: 'test-notebook.ipynb',
                path: '/test-notebook.ipynb',
                type: 'notebook'
            };
            
            const treeItem = treeDataProvider.getTreeItem(fileEntry);
            
            expect(treeItem.label).toBe('test-notebook.ipynb');
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
            expect(treeItem.iconPath).toEqual(new vscode.ThemeIcon('notebook'));
            expect(treeItem.contextValue).toBe('notebook');
            expect(treeItem.tooltip).toBe('/test-notebook.ipynb');
            expect(treeItem.command).toBeDefined();
            expect(treeItem.command?.command).toBe('vscode.open');
        });
    });
    
    describe('getChildren', () => {
        it('should return empty array when not connected', async () => {
            connection.isActive.mockReturnValueOnce(false);
            
            const children = await treeDataProvider.getChildren();
            
            expect(children).toEqual([]);
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'Not connected to JupyterHub server. Please connect first.'
            );
            expect(connection.listContents).not.toHaveBeenCalled();
        });
        
        it('should get root children when no element is provided', async () => {
            const mockContents = [
                { name: 'dir1', type: 'directory' },
                { name: 'file1.txt', type: 'file' },
                { name: 'notebook1.ipynb', type: 'notebook' }
            ];
            
            connection.listContents.mockResolvedValueOnce(mockContents);
            
            const children = await treeDataProvider.getChildren();
            
            expect(connection.listContents).toHaveBeenCalledWith('/');
            expect(children).toHaveLength(3);
            expect(children).toEqual([
                { name: 'dir1', path: '/dir1', type: 'directory' },
                { name: 'file1.txt', path: '/file1.txt', type: 'file' },
                { name: 'notebook1.ipynb', path: '/notebook1.ipynb', type: 'notebook' }
            ]);
        });
        
        it('should get children of a specific directory', async () => {
            const parentDir: FileEntry = {
                name: 'parent',
                path: '/parent',
                type: 'directory'
            };
            
            const mockContents = [
                { name: 'child-dir', type: 'directory' },
                { name: 'child-file.txt', type: 'file' }
            ];
            
            connection.listContents.mockResolvedValueOnce(mockContents);
            
            const children = await treeDataProvider.getChildren(parentDir);
            
            expect(connection.listContents).toHaveBeenCalledWith('/parent');
            expect(children).toHaveLength(2);
            expect(children).toEqual([
                { name: 'child-dir', path: '/parent/child-dir', type: 'directory' },
                { name: 'child-file.txt', path: '/parent/child-file.txt', type: 'file' }
            ]);
        });
        
        it('should sort directories first, then files alphabetically', async () => {
            const mockContents = [
                { name: 'c-file.txt', type: 'file' },
                { name: 'b-dir', type: 'directory' },
                { name: 'a-file.txt', type: 'file' },
                { name: 'a-dir', type: 'directory' }
            ];
            
            connection.listContents.mockResolvedValueOnce(mockContents);
            
            const children = await treeDataProvider.getChildren();
            
            // Directories should be first, then files
            expect(children.map(c => c.name)).toEqual([
                'a-dir',
                'b-dir',
                'a-file.txt',
                'c-file.txt'
            ]);
        });
        
        it('should handle errors when fetching children', async () => {
            const error = new Error('Network error');
            connection.listContents.mockRejectedValueOnce(error);
            
            const children = await treeDataProvider.getChildren();
            
            expect(children).toEqual([]);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Error fetching files: Network error'
            );
        });
    });
    
    describe('refresh', () => {
        it('should trigger the tree data change event', () => {
            const fireSpy = jest.spyOn(treeDataProvider['_onDidChangeTreeData'], 'fire');
            
            treeDataProvider.refresh();
            
            expect(fireSpy).toHaveBeenCalledWith(undefined);
        });
    });
}); 