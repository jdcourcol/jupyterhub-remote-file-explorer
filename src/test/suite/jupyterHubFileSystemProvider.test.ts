import * as assert from 'assert';
import * as vscode from 'vscode';
import { MockJupyterHubConnection } from '../mocks/mockJupyterHubConnection';
import { JupyterHubFileSystemProvider } from '../../jupyterHub/jupyterHubFileSystemProvider';
import { JupyterHubConnectionInterface } from '../../jupyterHub/jupyterHubConnection';

describe('JupyterHubFileSystemProvider Test Suite', () => {
    let mockConnection: MockJupyterHubConnection;
    let provider: JupyterHubFileSystemProvider;
    
    beforeEach(() => {
        // Reset any existing states
        mockConnection = new MockJupyterHubConnection();
        provider = new JupyterHubFileSystemProvider(mockConnection as any);
        
        // Connect to prepare for operations
        mockConnection.connect();
    });
    
    it('watch - Set up file watcher', () => {
        const uri = vscode.Uri.parse('jupyter-hub:/test.txt');
        const disposable = provider.watch(uri, { recursive: false, excludes: [] });
        
        assert.ok(disposable, 'Should return a disposable object');
        disposable.dispose(); // Cleanup
    });
    
    it('stat - Get file statistics', async () => {
        // Add a file for testing
        mockConnection.addMockFile('/test-stat.txt', 'For stat test');
        
        // Test file stat
        const fileUri = vscode.Uri.parse('jupyter-hub:/test-stat.txt');
        const stats = await provider.stat(fileUri);
        
        assert.strictEqual(stats.type, vscode.FileType.File, 'Should be a file');
        assert.ok(stats.size > 0, 'Should have size');
    });
    
    it('readDirectory - Read directory contents', async () => {
        // Ensure the test directory exists
        if (!mockConnection.countCalls('connect')) {
            await mockConnection.connect();
        }
        
        const dirUri = vscode.Uri.parse('jupyter-hub:/test-dir');
        
        // Ensure we get contents
        const contents = await provider.readDirectory(dirUri);
        
        assert.ok(Array.isArray(contents), 'Should return an array');
        assert.ok(contents.length > 0, 'Should have contents');
        
        // Check if expected files are in the results
        const hasFile1 = contents.some(([name, type]) => name === 'file1.txt' && type === vscode.FileType.File);
        const hasFile2 = contents.some(([name, type]) => name === 'file2.txt' && type === vscode.FileType.File);
        
        assert.ok(hasFile1, 'Should contain file1.txt');
        assert.ok(hasFile2, 'Should contain file2.txt');
    });
    
    it('readFile - Read file content', async () => {
        const fileUri = vscode.Uri.parse('jupyter-hub:/test.txt');
        const content = await provider.readFile(fileUri);
        
        assert.ok(content instanceof Uint8Array, 'Should return a Uint8Array');
        assert.ok(content.length > 0, 'Should have content');
        
        const contentStr = Buffer.from(content).toString('utf8');
        assert.strictEqual(contentStr, 'This is a test file', 'Content should match');
    });
    
    it('writeFile - Write to a file', async () => {
        const fileUri = vscode.Uri.parse('jupyter-hub:/test-write.txt');
        const content = Buffer.from('Test write content');
        
        await provider.writeFile(fileUri, content, { create: true, overwrite: true });
        
        // Verify by reading the file back
        const readContent = await provider.readFile(fileUri);
        const readContentStr = Buffer.from(readContent).toString('utf8');
        
        assert.strictEqual(readContentStr, 'Test write content', 'Written content should match read content');
    });
    
    it('createDirectory - Create a directory', async () => {
        const dirPath = '/test-create-dir';
        const dirUri = vscode.Uri.parse(`jupyter-hub:${dirPath}`);
        
        await provider.createDirectory(dirUri);
        
        // Create a file inside the directory to test
        const fileUri = vscode.Uri.parse(`jupyter-hub:${dirPath}/test.txt`);
        const content = Buffer.from('File in new directory');
        
        await provider.writeFile(fileUri, content, { create: true, overwrite: false });
        
        // Read the file back to verify
        const readContent = await provider.readFile(fileUri);
        const readContentStr = Buffer.from(readContent).toString('utf8');
        
        assert.strictEqual(readContentStr, 'File in new directory', 'File content in new directory should match');
    });
    
    it('delete - Delete files and directories', async () => {
        // First create a file to delete
        const fileUri = vscode.Uri.parse('jupyter-hub:/file-to-delete-test.txt');
        const content = Buffer.from('Delete me');
        
        await provider.writeFile(fileUri, content, { create: true, overwrite: true });
        
        // Now delete it
        await provider.delete(fileUri, { recursive: false });
        
        // Try to read it - should throw
        try {
            await provider.readFile(fileUri);
            assert.fail('Should throw error when reading deleted file');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw Error');
            // The error could be either File not found or vscode.FileSystemError
        }
    });
    
    it('rename - Rename files', async () => {
        // Create a file to rename
        const originalUri = vscode.Uri.parse('jupyter-hub:/rename-test.txt');
        const renamedUri = vscode.Uri.parse('jupyter-hub:/renamed-file-test.txt');
        const content = Buffer.from('Rename me');
        
        await provider.writeFile(originalUri, content, { create: true, overwrite: true });
        
        // Rename the file
        await provider.rename(originalUri, renamedUri, { overwrite: false });
        
        // Try to read the original file - should throw
        try {
            await provider.readFile(originalUri);
            assert.fail('Should throw error when reading renamed file at original location');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw Error');
        }
        
        // Read the renamed file
        const renamedContent = await provider.readFile(renamedUri);
        assert.strictEqual(Buffer.from(renamedContent).toString(), 'Rename me', 'Renamed file content should match');
    });
    
    it('should attempt to rename a directory', async () => {
        const oldDirUri = vscode.Uri.parse('jupyter-hub:/old-dir-test');
        const newDirUri = vscode.Uri.parse('jupyter-hub:/new-dir-test');
        
        // Create the directory
        await provider.createDirectory(oldDirUri);
        
        // Attempt to rename it - should throw
        try {
            await provider.rename(oldDirUri, newDirUri, { overwrite: false });
            assert.fail('Should throw error when renaming directory');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw Error');
            assert.ok(error.message.includes('Directory rename not yet implemented') || 
                      error.message.includes('Resource unavailable'), 
                'Error should mention directory rename not implemented or resource unavailable');
        }
    });
    
    it('buffered files - Test file buffering', async () => {
        // Create a known file
        const fileUri = vscode.Uri.parse('jupyter-hub:/buffered-file.txt');
        
        // Read the file (buffered content should be set)
        const initialContent = await provider.readFile(fileUri);
        assert.strictEqual(Buffer.from(initialContent).toString(), 'Initial content', 
            'Initial content should match');
        
        // Write to the buffer without saving
        const updatedContent = Buffer.from('Updated but not saved to server');
        (provider as any)._bufferedFiles.set(fileUri.toString(), updatedContent);
        
        // Read from buffer - should get updated content
        const readFromBuffer = await provider.readFile(fileUri);
        assert.strictEqual(Buffer.from(readFromBuffer).toString(), 'Updated but not saved to server', 
            'Should read from buffer');
        
        // Clear the buffer
        provider.clearBufferedFiles();
        
        // Read the file again - should get original content from server
        const readAfterClear = await provider.readFile(fileUri);
        assert.strictEqual(Buffer.from(readAfterClear).toString(), 'Initial content', 
            'Should read from server after buffer is cleared');
    });
}); 