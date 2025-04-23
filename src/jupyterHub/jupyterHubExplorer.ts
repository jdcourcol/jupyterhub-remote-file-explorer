import * as vscode from 'vscode';
import * as path from 'path';
import { JupyterHubConnection } from './jupyterHubConnection';

/**
 * Interface for a tree item representing a file or directory in the JupyterHub explorer.
 * Used to represent the hierarchical file structure in the tree view.
 */
export interface FileEntry {
    /** The display name of the file or directory */
    name: string;
    /** The full path of the file or directory */
    path: string;
    /** The type of the item (directory, file, or notebook) */
    type: 'directory' | 'file' | 'notebook';
    /** Optional array of child items (for directories) */
    children?: FileEntry[];
}

/**
 * Tree data provider for the JupyterHub explorer view.
 * Provides the data structure and handling for the VS Code tree view component.
 */
export class JupyterHubTreeDataProvider implements vscode.TreeDataProvider<FileEntry> {
    /** Event emitter for tree data changes */
    private _onDidChangeTreeData: vscode.EventEmitter<FileEntry | undefined> = new vscode.EventEmitter<FileEntry | undefined>();
    /** Event that fires when tree data changes */
    readonly onDidChangeTreeData: vscode.Event<FileEntry | undefined> = this._onDidChangeTreeData.event;
    
    /**
     * Creates a new JupyterHub tree data provider
     * @param connection - The JupyterHub connection to use for API calls
     */
    constructor(private connection: JupyterHubConnection) {}
    
    /**
     * Refreshes the explorer view.
     * Triggers a refresh of all tree items.
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
    
    /**
     * Forces a full refresh by clearing any cached data.
     * Fires multiple events to ensure the tree view is fully refreshed.
     */
    public forceRefresh(): void {
        // Fire two events - first with undefined to refresh everything,
        // then after a short delay to ensure any cache is cleared
        this._onDidChangeTreeData.fire(undefined);
        setTimeout(() => {
            this._onDidChangeTreeData.fire(undefined);
        }, 300);
    }
    
    /**
     * Gets the tree item representation for a file entry.
     * @param element - The file entry to convert to a tree item
     * @returns The VS Code tree item for display in the explorer
     */
    getTreeItem(element: FileEntry): vscode.TreeItem {
        // Create tree item with proper collapsible state
        let collapsibleState = vscode.TreeItemCollapsibleState.None;
        if (element.type === 'directory') {
            collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
        
        // Use element name for label - keep it short and direct
        const treeItem = new vscode.TreeItem(element.name, collapsibleState);
        
        // Set icon for file type
        if (element.type === 'directory') {
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            treeItem.contextValue = 'directory';
        } else if (element.type === 'notebook') {
            treeItem.iconPath = new vscode.ThemeIcon('notebook');
            treeItem.contextValue = 'notebook';
        } else {
            treeItem.iconPath = new vscode.ThemeIcon('file');
            treeItem.contextValue = 'file';
        }
        
        // Use a compact description that only shows when needed
        // This helps reduce horizontal width requirements
        treeItem.description = undefined; // No description by default
        
        // Set tooltip to show full path on hover instead of in the tree
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
        
        return treeItem;
    }
    
    /**
     * Gets the children of a file entry.
     * @param element - The parent element to get children for, undefined for root
     * @returns A promise that resolves to an array of child file entries
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
            vscode.window.showErrorMessage(`Error fetching files: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    
    /**
     * Helper method that can be used to update the directory tree item when expanded.
     * Currently this method is not needed but kept for future extensions.
     * @param expandedElement - The element that was expanded
     */
    public onDidExpandElement(expandedElement: FileEntry): void {
        // No longer needed
    }
} 