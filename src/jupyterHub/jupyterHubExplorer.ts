import * as vscode from 'vscode';
import * as path from 'path';
import { JupyterHubConnection } from './jupyterHubConnection';

/**
 * Interface for a tree item representing a file or directory
 */
export interface FileEntry {
    name: string;
    path: string;
    type: 'directory' | 'file' | 'notebook';
    children?: FileEntry[];
}

/**
 * Tree data provider for the JupyterHub explorer view
 */
export class JupyterHubTreeDataProvider implements vscode.TreeDataProvider<FileEntry> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileEntry | undefined> = new vscode.EventEmitter<FileEntry | undefined>();
    readonly onDidChangeTreeData: vscode.Event<FileEntry | undefined> = this._onDidChangeTreeData.event;
    
    constructor(private connection: JupyterHubConnection) {}
    
    /**
     * Refresh the explorer view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
    
    /**
     * Get tree item representation
     */
    getTreeItem(element: FileEntry): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            element.name,
            element.type === 'directory' 
                ? vscode.TreeItemCollapsibleState.Collapsed 
                : vscode.TreeItemCollapsibleState.None
        );
        
        // Set icon for file type
        if (element.type === 'directory') {
            treeItem.iconPath = new vscode.ThemeIcon('folder');
        } else if (element.type === 'notebook') {
            treeItem.iconPath = new vscode.ThemeIcon('notebook');
        } else {
            treeItem.iconPath = new vscode.ThemeIcon('file');
        }
        
        // Set tooltip
        treeItem.tooltip = element.path;
        
        // Set command for files
        if (element.type !== 'directory') {
            const scheme = 'jupyter-hub';
            const filePath = element.path.startsWith('/') ? element.path : `/${element.path}`;
            const uri = vscode.Uri.parse(`${scheme}:${filePath}`);
            
            treeItem.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [uri]
            };
        }
        
        // Set context for context menu
        treeItem.contextValue = element.type;
        
        return treeItem;
    }
    
    /**
     * Get children of element
     */
    async getChildren(element?: FileEntry): Promise<FileEntry[]> {
        try {
            if (!this.connection.isActive()) {
                // We're not connected, return empty array or prompt connection
                vscode.window.showWarningMessage('Not connected to JupyterHub server. Please connect first.');
                return [];
            }
            
            const path = element ? element.path : '/';
            const contents = await this.connection.listContents(path);
            
            return contents.map(item => {
                // Determine the file type
                let type: 'directory' | 'file' | 'notebook' = 'file';
                
                if (item.type === 'directory') {
                    type = 'directory';
                } else if (item.type === 'notebook') {
                    type = 'notebook';
                }
                
                const fullPath = element 
                    ? `${element.path}/${item.name}`.replace(/\/+/g, '/') 
                    : `/${item.name}`;
                
                return {
                    name: item.name,
                    path: fullPath,
                    type
                };
            }).sort((a, b) => {
                // Sort directories first, then files alphabetically
                if (a.type === 'directory' && b.type !== 'directory') {
                    return -1;
                }
                if (a.type !== 'directory' && b.type === 'directory') {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });
        } catch (error) {
            console.error('Error getting children:', error);
            vscode.window.showErrorMessage(`Error fetching files: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
} 