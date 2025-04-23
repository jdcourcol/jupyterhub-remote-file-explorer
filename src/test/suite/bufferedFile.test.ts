import * as assert from 'assert';
import * as vscode from 'vscode';
import { BufferedFile } from '../../jupyterHub/bufferedFile';
import { MockJupyterHubConnection } from '../mocks/mockJupyterHubConnection';

suite('BufferedFile Test Suite', () => {
    let connection: MockJupyterHubConnection;
    
    setup(async () => {
        // Initialize mock connection for each test
        connection = new MockJupyterHubConnection();
        await connection.connect();
        
        // Add some test files to the mock connection
        connection.addMockFile('/test.txt', 'Initial test content');
        connection.addMockFile('/test.ipynb', JSON.stringify({
            cells: [],
            metadata: {},
            nbformat: 4,
            nbformat_minor: 2
        }));
    });
    
    teardown(() => {
        connection.disconnect();
    });
    
    test('BufferedFile initialization', async () => {
        const file = new BufferedFile('/test.txt', connection);
        
        // Check initial state
        assert.strictEqual(file.isClosed(), false, 'File should not be closed initially');
        assert.strictEqual(file.isDirty(), false, 'File should not be dirty initially');
        assert.strictEqual(file.getPath(), '/test.txt', 'File path should match');
        
        // Content should be empty until read
        assert.strictEqual(file.getContent(), '', 'Initial content should be empty');
    });
    
    test('Read content from server', async () => {
        const file = new BufferedFile('/test.txt', connection);
        
        // Read content
        await file.readFromServer();
        
        // Verify content and state
        assert.strictEqual(file.getContent(), 'Initial test content', 'Content should match server content');
        assert.strictEqual(file.isDirty(), false, 'File should not be dirty after reading');
    });
    
    test('Write content to buffer', async () => {
        const file = new BufferedFile('/test.txt', connection);
        await file.readFromServer();
        
        // Write new content
        const newContent = 'Updated content';
        file.write(newContent);
        
        // Verify content and state
        assert.strictEqual(file.getContent(), newContent, 'Content should match written content');
        assert.strictEqual(file.isDirty(), true, 'File should be dirty after writing');
        
        // Server content should not change until saved
        const serverContent = await connection.getFileContent('/test.txt');
        assert.strictEqual(serverContent, 'Initial test content', 'Server content should not change until saved');
    });
    
    test('Save buffered content to server', async () => {
        const file = new BufferedFile('/test.txt', connection);
        await file.readFromServer();
        
        // Write and save new content
        const newContent = 'Content to be saved';
        file.write(newContent);
        await file.save();
        
        // Verify state
        assert.strictEqual(file.isDirty(), false, 'File should not be dirty after saving');
        
        // Server content should be updated
        const serverContent = await connection.getFileContent('/test.txt');
        assert.strictEqual(serverContent, newContent, 'Server content should be updated after save');
    });
    
    test('Revert buffered changes', async () => {
        const file = new BufferedFile('/test.txt', connection);
        await file.readFromServer();
        
        // Make changes then revert
        file.write('Temporary content that will be reverted');
        assert.strictEqual(file.isDirty(), true, 'File should be dirty after writing');
        
        file.revert();
        
        // Verify content and state
        assert.strictEqual(file.getContent(), 'Initial test content', 'Content should revert to server content');
        assert.strictEqual(file.isDirty(), false, 'File should not be dirty after reverting');
    });
    
    test('Create new file with BufferedFile', async () => {
        const newPath = '/new-test-file.txt';
        const file = new BufferedFile(newPath, connection);
        
        // Write content to new file
        const newContent = 'Content for new file';
        file.write(newContent);
        await file.save();
        
        // Verify server has the new file
        const serverContent = await connection.getFileContent(newPath);
        assert.strictEqual(serverContent, newContent, 'New file should be created on server');
    });
    
    test('Multiple write operations', async () => {
        const file = new BufferedFile('/test.txt', connection);
        await file.readFromServer();
        
        // Perform multiple writes
        file.write('First update');
        file.write('Second update');
        file.write('Final content');
        
        // Only the last write should be in the buffer
        assert.strictEqual(file.getContent(), 'Final content', 'Content should reflect last write operation');
        
        // Save and check server content
        await file.save();
        const serverContent = await connection.getFileContent('/test.txt');
        assert.strictEqual(serverContent, 'Final content', 'Server content should match final write after save');
    });
    
    test('Error handling - Server error during save', async () => {
        const file = new BufferedFile('/test.txt', connection);
        await file.readFromServer();
        
        // Write new content
        file.write('Content that will fail to save');
        
        // Simulate server error
        connection.mockServerError = true;
        
        try {
            await file.save();
            assert.fail('Save should have thrown an error');
        } catch (error) {
            // Expected error
            assert.strictEqual(file.isDirty(), true, 'File should still be dirty after failed save');
        }
        
        // Reset mock server error and verify content didn't change on server
        connection.mockServerError = false;
        const serverContent = await connection.getFileContent('/test.txt');
        assert.strictEqual(serverContent, 'Initial test content', 'Server content should not change after failed save');
    });
}); 