import * as assert from 'assert';
import * as vscode from 'vscode';
import { MockJupyterHubConnection } from '../mocks/mockJupyterHubConnection';

suite('JupyterHubConnection Test Suite', () => {
    let mockConnection: MockJupyterHubConnection;

    setup(() => {
        // Create a fresh mock connection for each test
        mockConnection = new MockJupyterHubConnection();
    });

    teardown(() => {
        // Clean up after each test
        mockConnection.disconnect();
    });

    test('Connection lifecycle', async () => {
        // Test connecting
        const connected = await mockConnection.connect();
        assert.strictEqual(connected, true, 'Connection should be successful');
        assert.strictEqual(mockConnection.isActive(), true, 'Connection should be active after connect');
        assert.strictEqual(mockConnection.countCalls('connect'), 1, 'connect() should be called once');

        // Test disconnecting
        mockConnection.disconnect();
        assert.strictEqual(mockConnection.isActive(), false, 'Connection should be inactive after disconnect');
        assert.strictEqual(mockConnection.countCalls('disconnect'), 1, 'disconnect() should be called once');
    });

    test('List contents', async () => {
        // Connect first
        await mockConnection.connect();
        
        // List root contents
        const rootContents = await mockConnection.listContents('/');
        assert.ok(Array.isArray(rootContents), 'listContents should return an array');
        
        // We need to update the test to match our current mock implementation
        // Root directory should have 4 items (test.txt, test.ipynb, folder1, folder2)
        assert.strictEqual(rootContents.length, 4, 'Root should have 4 items');
        
        // Check that directories are returned correctly
        const folderNames = rootContents.filter(item => item.type === 'directory').map(item => item.name);
        assert.ok(folderNames.includes('folder1'), 'Root should contain folder1');
        assert.ok(folderNames.includes('folder2'), 'Root should contain folder2');
        
        // Add a file to folder1 and check folder contents
        const newFileName = 'example.txt';
        mockConnection.addMockFile('/folder1/example.txt', 'Example content');
        const folder1Contents = await mockConnection.listContents('/folder1');
        
        // folder1 should already have 4 items plus our new file
        assert.strictEqual(folder1Contents.length, 5, 'folder1 should have 5 items');
        const exampleFile = folder1Contents.find(item => item.name === newFileName);
        assert.ok(exampleFile, 'The added file should be in the folder');
        assert.strictEqual(exampleFile?.type, 'file', 'Item type should be file');
    });

    test('Get file content', async () => {
        // Connect first
        await mockConnection.connect();
        
        // Get an existing file content directly
        const content = await mockConnection.getFileContent('/test.txt');
        assert.strictEqual(content, 'This is a test file', 'Content should match');
        
        // Get a notebook file content
        const notebookContent = await mockConnection.getFileContent('/test.ipynb');
        assert.ok(notebookContent.includes('"cells":'), 'Notebook content should include cells property');
        assert.ok(notebookContent.includes('"metadata":'), 'Notebook content should include metadata property');
        
        // Try to get a non-existent file
        try {
            await mockConnection.getFileContent('/nonexistent.txt');
            assert.fail('Should have thrown an error for non-existent file');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error');
            assert.ok((error as Error).message.includes('File not found'), 'Error message should mention file not found');
        }
    });

    test('Create and delete files', async () => {
        // Connect first
        await mockConnection.connect();
        
        // Create a text file
        const newFilePath = '/new-file.txt';
        const newFileContent = 'This is a new file';
        const newFile = await mockConnection.createItem(newFilePath, 'file', newFileContent);
        
        assert.strictEqual(newFile.type, 'file', 'Type should be file');
        assert.strictEqual(newFile.name, 'new-file.txt', 'Name should match');
        assert.strictEqual(newFile.path, newFilePath, 'Path should match');
        
        // Verify the file exists and has the right content
        const retrievedContent = await mockConnection.getFileContent(newFilePath);
        assert.strictEqual(retrievedContent, newFileContent, 'Content should match what was created');
        
        // Delete the file
        await mockConnection.deleteItem(newFilePath);
        
        // Verify the file is gone
        try {
            await mockConnection.getFileContent(newFilePath);
            assert.fail('Should have thrown an error for deleted file');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error');
            assert.ok((error as Error).message.includes('File not found'), 'Error message should mention file not found');
        }
    });

    test('Create and delete directories', async () => {
        // Connect first
        await mockConnection.connect();
        
        // Create a directory
        const newDirPath = '/new-directory';
        const newDir = await mockConnection.createItem(newDirPath, 'directory');
        
        assert.strictEqual(newDir.type, 'directory', 'Type should be directory');
        assert.strictEqual(newDir.name, 'new-directory', 'Name should match');
        
        // Verify the directory exists by listing its contents
        const dirContents = await mockConnection.listContents(newDirPath);
        assert.strictEqual(dirContents.length, 0, 'New directory should be empty');
        
        // Create a file in the directory
        await mockConnection.createItem(`${newDirPath}/file.txt`, 'file', 'File in directory');
        
        // Try to delete the directory (should fail because it's not empty)
        try {
            await mockConnection.deleteItem(newDirPath);
            assert.fail('Should have thrown an error for non-empty directory');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error');
            assert.ok((error as Error).message.includes('Directory not empty'), 'Error message should mention directory not empty');
        }
        
        // Delete the file first
        await mockConnection.deleteItem(`${newDirPath}/file.txt`);
        
        // Now delete the directory
        await mockConnection.deleteItem(newDirPath);
        
        // Verify the directory is gone
        try {
            await mockConnection.listContents(newDirPath);
            assert.fail('Should have thrown an error for deleted directory');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error');
            assert.ok((error as Error).message.includes('Directory not found'), 'Error message should mention directory not found');
        }
    });

    test('Save file content', async () => {
        // Connect first
        await mockConnection.connect();
        
        // Create a text file
        const filePath = '/test-save.txt';
        await mockConnection.createItem(filePath, 'file', 'Initial content');
        
        // Update the file content
        const newContent = 'Updated content';
        await mockConnection.saveFile(filePath, newContent);
        
        // Verify by getting the file content
        const retrievedContent = await mockConnection.getFileContent(filePath);
        assert.strictEqual(retrievedContent, newContent, 'Retrieved content should match updated content');
    });

    test('Error handling - not connected', async () => {
        // Don't connect first
        
        try {
            await mockConnection.listContents('/');
            assert.fail('Should have thrown an error for not being connected');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error');
            assert.ok((error as Error).message.includes('Not connected'), 'Error message should mention not connected');
        }
        
        try {
            await mockConnection.getFileContent('/test.txt');
            assert.fail('Should have thrown an error for not being connected');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error');
            assert.ok((error as Error).message.includes('Not connected'), 'Error message should mention not connected');
        }
        
        try {
            await mockConnection.createItem('/test.txt', 'file', 'content');
            assert.fail('Should have thrown an error for not being connected');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error');
            assert.ok((error as Error).message.includes('Not connected'), 'Error message should mention not connected');
        }
    });
}); 