import * as vscode from 'vscode';
import * as path from 'path';
import { JupyterHubConnection } from './jupyterHubConnection';

/**
 * File system provider for JupyterHub remote files
 */
export class JupyterHubFileSystemProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    private _bufferedFiles = new Map<string, Buffer>();
    
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;
    
    constructor(private connection: JupyterHubConnection) {}

    // Watch for file changes - not fully implemented as JupyterHub doesn't provide a watch API
    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // Return a no-op disposable
        return new vscode.Disposable(() => {});
    }

    // Get file statistics
    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        try {
            // For the root directory
            if (uri.path === '/') {
                return {
                    type: vscode.FileType.Directory,
                    ctime: 0,
                    mtime: 0,
                    size: 0
                };
            }
            
            const content = await this.connection.getFileContent(uri.path);
            
            return {
                type: content.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File,
                ctime: new Date(content.created || 0).getTime(),
                mtime: new Date(content.last_modified || 0).getTime(),
                size: content.size || 0
            };
        } catch (error) {
            console.error(`Error in stat for ${uri.path}:`, error);
            throw vscode.FileSystemError.FileNotFound();
        }
    }

    // Read the contents of a directory
    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        try {
            const contents = await this.connection.listContents(uri.path);
            
            return contents.map(item => {
                const type = item.type === 'directory' 
                    ? vscode.FileType.Directory 
                    : vscode.FileType.File;
                return [item.name, type];
            });
        } catch (error) {
            console.error(`Error in readDirectory for ${uri.path}:`, error);
            throw vscode.FileSystemError.FileNotFound();
        }
    }

    // Create a directory
    async createDirectory(uri: vscode.Uri): Promise<void> {
        try {
            await this.connection.createItem(uri.path, 'directory');
            this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
        } catch (error) {
            console.error(`Error creating directory ${uri.path}:`, error);
            throw vscode.FileSystemError.Unavailable();
        }
    }

    // Read a file
    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        try {
            console.log(`Reading file: ${uri.path}`);
            
            // First check if we have a buffered version (for unsaved changes)
            const buffered = this._bufferedFiles.get(uri.toString());
            if (buffered) {
                console.log(`Using buffered content for ${uri.path}`);
                return buffered;
            }
            
            const content = await this.connection.getFileContent(uri.path);
            
            // JupyterHub API returns content in different formats based on the file type
            let data: Buffer;
            
            console.log(`File format for ${uri.path}: ${content.format}`);
            
            if (content.format === 'text') {
                data = Buffer.from(content.content, 'utf8');
            } else if (content.format === 'base64') {
                data = Buffer.from(content.content, 'base64');
            } else if (content.format === 'json') {
                // For notebooks, we need to serialize the JSON content
                if (uri.path.endsWith('.ipynb')) {
                    try {
                        // Content might already be an object if returned directly from API
                        const jsonContent = typeof content.content === 'string' 
                            ? JSON.parse(content.content) 
                            : content.content;
                        data = Buffer.from(JSON.stringify(jsonContent, null, 2), 'utf8');
                    } catch (jsonError) {
                        console.error(`Error parsing notebook JSON: ${jsonError}`);
                        // Fall back to direct stringification if parsing fails
                        data = Buffer.from(JSON.stringify(content.content), 'utf8');
                    }
                } else {
                    data = Buffer.from(JSON.stringify(content.content), 'utf8');
                }
            } else {
                throw new Error(`Unsupported format: ${content.format}`);
            }
            
            return data;
        } catch (error) {
            console.error(`Error in readFile for ${uri.path}:`, error);
            throw vscode.FileSystemError.FileNotFound();
        }
    }

    // Write a file
    async writeFile(
        uri: vscode.Uri, 
        content: Uint8Array, 
        options: { create: boolean; overwrite: boolean }
    ): Promise<void> {
        try {
            console.log(`Writing file: ${uri.path}, size: ${content.byteLength} bytes, create: ${options.create}, overwrite: ${options.overwrite}`);
            
            // Buffer the file content in memory for faster access
            this._bufferedFiles.set(uri.toString(), Buffer.from(content));
            
            // Convert buffer to string for Jupyter API
            const contentStr = Buffer.from(content).toString('utf8');
            
            // Try to create/update the file
            try {
                if (options.create) {
                    // Always use createItem which now uses PUT for files
                    console.log(`Creating new file via PUT: ${uri.path}`);
                    await this.connection.createItem(uri.path, 'file', contentStr);
                    this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
                    vscode.window.setStatusBarMessage(`File ${uri.path} created successfully`, 3000);
                } else {
                    // Update existing file
                    console.log(`Updating existing file: ${uri.path}`);
                    await this.connection.saveFile(uri.path, contentStr);
                    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
                    vscode.window.setStatusBarMessage(`File ${uri.path} saved successfully`, 3000);
                }
            } catch (error) {
                console.error(`Error creating/saving file: ${error}`);
                throw error;
            }
        } catch (error) {
            console.error(`Error in writeFile for ${uri.path}:`, error);
            
            // Show detailed error message
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to save file ${uri.path}: ${errorMessage}`);
            
            throw vscode.FileSystemError.Unavailable();
        }
    }

    // Delete a file or directory
    async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
        try {
            // Remove from buffer if present
            this._bufferedFiles.delete(uri.toString());
            
            // Delete the item on the server
            await this.connection.deleteItem(uri.path);
            this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
        } catch (error) {
            console.error(`Error in delete for ${uri.path}:`, error);
            throw vscode.FileSystemError.Unavailable();
        }
    }

    // Rename a file or directory
    async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
        try {
            // Remove from buffer if present
            const buffered = this._bufferedFiles.get(oldUri.toString());
            if (buffered) {
                this._bufferedFiles.delete(oldUri.toString());
            }
            
            // JupyterHub doesn't have a direct rename API, so we need to:
            // 1. Read the old file/get info
            const stats = await this.stat(oldUri);
            
            if (stats.type === vscode.FileType.Directory) {
                // For directories: create new dir, copy contents, delete old dir
                await this.createDirectory(newUri);
                
                // TODO: Implement recursive directory copy
                // This is complex and would require recursive copying of all contents
                throw new Error('Directory rename not yet implemented');
            } else {
                // For files: read content, create new file, delete old file
                const content = await this.readFile(oldUri);
                await this.writeFile(newUri, content, { create: true, overwrite: options.overwrite });
                await this.delete(oldUri, { recursive: false });
            }
            
            this._emitter.fire([
                { type: vscode.FileChangeType.Deleted, uri: oldUri },
                { type: vscode.FileChangeType.Created, uri: newUri }
            ]);
        } catch (error) {
            console.error(`Error in rename from ${oldUri.path} to ${newUri.path}:`, error);
            throw vscode.FileSystemError.Unavailable();
        }
    }
    
    // Clear any buffered file data
    clearBufferedFiles(): void {
        this._bufferedFiles.clear();
    }
} 