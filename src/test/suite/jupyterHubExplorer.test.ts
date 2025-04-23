import * as assert from 'assert';
import * as vscode from 'vscode';
import { MockJupyterHubConnection } from '../mocks/mockJupyterHubConnection';
import { JupyterHubTreeDataProvider, FileEntry } from '../../jupyterHub/jupyterHubExplorer';

suite('JupyterHubTreeDataProvider Test Suite', () => {
    let connection: MockJupyterHubConnection;
    let treeDataProvider: JupyterHubTreeDataProvider;
    
    setup(async () => {
        // Set up mock connection and tree data provider
        connection = new MockJupyterHubConnection();
        // Cast as any to bypass type checking since we're using a mock
        treeDataProvider = new JupyterHubTreeDataProvider(connection as any);
        
        // Connect to mock server
        await connection.connect();
        
        // Set up test files
        connection.addMockFile('/folder1/file1.txt', 'Content of file1');
        connection.addMockFile('/folder1/file2.txt', 'Content of file2');
        connection.addMockFile('/folder1/test.ipynb', JSON.stringify({
            cells: [], 
            metadata: {}, 
            nbformat: 4, 
            nbformat_minor: 2
        }));
    });
    
    teardown(() => {
        connection.disconnect();
    });
    
    test('getChildren - Root directory', async () => {
        const children = await treeDataProvider.getChildren();
        
        assert.ok(Array.isArray(children), 'getChildren should return an array');
        // Root should have 4 items (test.txt, test.ipynb, folder1, folder2)
        assert.strictEqual(children.length, 4, 'Root should have 4 items (test.txt, test.ipynb, folder1, folder2)');
        
        // Verify both folders are returned
        const folderEntries = children.filter(entry => entry.type === 'directory');
        assert.strictEqual(folderEntries.length, 2, 'Root should have 2 folders');
        
        // Verify folder names
        const folderNames = folderEntries.map(entry => entry.name);
        assert.ok(folderNames.includes('folder1'), 'folder1 should be in root');
        assert.ok(folderNames.includes('folder2'), 'folder2 should be in root');
    });
    
    test('getChildren - Subdirectory', async () => {
        // Get root children
        const rootChildren = await treeDataProvider.getChildren();
        const folder1 = rootChildren.find(entry => entry.name === 'folder1');
        assert.ok(folder1, 'folder1 should be in root children');
        
        const folder1Children = await treeDataProvider.getChildren(folder1);
        // folder1 should have file1.txt, file2.txt, test.ipynb, and subfolder
        assert.strictEqual(folder1Children.length, 4, 'folder1 should have 4 items');
        
        // Check file entries
        const fileEntries = folder1Children.filter(entry => entry.type === 'file' || entry.type === 'notebook');
        assert.strictEqual(fileEntries.length, 3, 'folder1 should have 3 files');
        
        // Check directory entries
        const dirEntries = folder1Children.filter(entry => entry.type === 'directory');
        assert.strictEqual(dirEntries.length, 1, 'folder1 should have 1 subdirectory');
        assert.strictEqual(dirEntries[0].name, 'subfolder', 'Subdirectory should be named subfolder');
    });
    
    test('getTreeItem - File and directory', async () => {
        // Get the first directory
        const rootChildren = await treeDataProvider.getChildren();
        const folder1 = rootChildren.find(entry => entry.name === 'folder1') as FileEntry;
        
        // Get TreeItem for a directory
        const dirTreeItem = treeDataProvider.getTreeItem(folder1);
        assert.strictEqual(dirTreeItem.label, 'folder1', 'Directory tree item label should match');
        assert.strictEqual(dirTreeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed, 
            'Directory should be collapsible');
        
        // Get children of first directory
        const folder1Children = await treeDataProvider.getChildren(folder1);
        const file1 = folder1Children.find(entry => entry.name === 'file1.txt') as FileEntry;
        
        // Get TreeItem for a file
        const fileTreeItem = treeDataProvider.getTreeItem(file1);
        assert.strictEqual(fileTreeItem.label, 'file1.txt', 'File tree item label should match');
        assert.strictEqual(fileTreeItem.collapsibleState, vscode.TreeItemCollapsibleState.None,
            'File should not be collapsible');
    });
    
    test('getChildren - Notebook files', async () => {
        // Get root children
        const rootChildren = await treeDataProvider.getChildren();
        const folder1 = rootChildren.find(entry => entry.name === 'folder1');
        assert.ok(folder1, 'folder1 should be in root children');
        
        // Get folder1 children
        const folder1Children = await treeDataProvider.getChildren(folder1);
        
        // Find the notebook entry
        const notebookEntry = folder1Children.find(entry => entry.name === 'test.ipynb');
        assert.ok(notebookEntry, 'test.ipynb should be in folder1 children');
        assert.strictEqual(notebookEntry?.type, 'notebook', 'test.ipynb should have type notebook');
    });
}); 