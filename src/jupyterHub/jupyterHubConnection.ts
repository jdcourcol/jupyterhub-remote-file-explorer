import * as vscode from 'vscode';
import axios from 'axios';

export interface JupyterHubConnectionOptions {
    serverUrl: string;
    token: string;
    username?: string;
}

export class JupyterHubConnection {
    private serverUrl: string;
    private token: string;
    private username?: string;
    private isConnected: boolean = false;
    private apiBaseUrl: string = '';

    constructor(options: JupyterHubConnectionOptions) {
        this.serverUrl = options.serverUrl;
        this.token = options.token;
        this.username = options.username;
    }

    /**
     * Connect to the JupyterHub server
     */
    public async connect(): Promise<boolean> {
        try {
            // Normalize URL
            if (!this.serverUrl.startsWith('http')) {
                this.serverUrl = `https://${this.serverUrl}`;
            }
            
            if (this.serverUrl.endsWith('/')) {
                this.serverUrl = this.serverUrl.slice(0, -1);
            }
            
            // Validate connection by getting user info
            const response = await axios.get(`${this.serverUrl}/hub/api/user`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });
            
            if (response.status === 200 && response.data) {
                this.username = response.data.name;
                this.apiBaseUrl = `${this.serverUrl}/user/${this.username}/api`;
                this.isConnected = true;
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Failed to connect to JupyterHub server:', error);
            
            // Check for unauthorized error - likely invalid or expired token
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                vscode.window.showErrorMessage('JupyterHub credentials are invalid or expired. Please reconnect with new credentials.');
                // Dispatch a custom event for credential invalidation
                const invalidCredentialsEvent = new vscode.EventEmitter<void>();
                vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
            } else {
                vscode.window.showErrorMessage(`Failed to connect to JupyterHub server: ${error instanceof Error ? error.message : String(error)}`);
            }
            return false;
        }
    }
    
    /**
     * Disconnect from the JupyterHub server
     */
    public disconnect(): void {
        this.isConnected = false;
    }
    
    /**
     * Get the list of files at the specified path
     */
    public async listContents(path: string): Promise<any[]> {
        if (!this.isConnected) {
            throw new Error('Not connected to JupyterHub server');
        }
        
        try {
            // Normalize path
            if (!path.startsWith('/')) {
                path = `/${path}`;
            }
            
            const response = await axios.get(`${this.apiBaseUrl}/contents${path}`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });
            
            if (response.status === 200 && response.data) {
                return response.data.content || [];
            }
            
            return [];
        } catch (error) {
            console.error(`Failed to list contents at path ${path}:`, error);
            
            // Check for unauthorized error - likely invalid or expired token
            if (this.isCredentialError(error)) {
                vscode.window.showErrorMessage('JupyterHub credentials are invalid or expired. Please reconnect with new credentials.');
                this.isConnected = false;
                vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
                throw new Error('Invalid credentials');
            }
            
            throw new Error(`Failed to list contents: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Get file content
     */
    public async getFileContent(path: string): Promise<any> {
        if (!this.isConnected) {
            throw new Error('Not connected to JupyterHub server');
        }
        
        try {
            // Normalize path
            if (!path.startsWith('/')) {
                path = `/${path}`;
            }
            
            const response = await axios.get(`${this.apiBaseUrl}/contents${path}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    content: 1
                }
            });
            
            if (response.status === 200 && response.data) {
                return response.data;
            }
            
            throw new Error('Failed to get file content');
        } catch (error) {
            console.error(`Failed to get file content at path ${path}:`, error);
            
            // Check for unauthorized error - likely invalid or expired token
            if (this.isCredentialError(error)) {
                vscode.window.showErrorMessage('JupyterHub credentials are invalid or expired. Please reconnect with new credentials.');
                this.isConnected = false;
                vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
                throw new Error('Invalid credentials');
            }
            
            throw new Error(`Failed to get file content: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Create a new file or directory
     */
    public async createItem(path: string, type: 'file' | 'directory', content?: string): Promise<any> {
        if (!this.isConnected) {
            throw new Error('Not connected to JupyterHub server');
        }
        
        try {
            // Get the directory and filename
            const lastSlashIndex = path.lastIndexOf('/');
            const directory = path.substring(0, lastSlashIndex) || '/';
            const name = path.substring(lastSlashIndex + 1);
            
            const data: any = {
                type: type,
                name: name
            };
            
            if (type === 'file' && content !== undefined) {
                data.content = content;
            }
            
            const response = await axios.post(`${this.apiBaseUrl}/contents${directory}`, data, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.status === 201 && response.data) {
                return response.data;
            }
            
            throw new Error(`Failed to create ${type}`);
        } catch (error) {
            console.error(`Failed to create ${type} at path ${path}:`, error);
            
            // Check for unauthorized error - likely invalid or expired token
            if (this.isCredentialError(error)) {
                vscode.window.showErrorMessage('JupyterHub credentials are invalid or expired. Please reconnect with new credentials.');
                this.isConnected = false;
                vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
                throw new Error('Invalid credentials');
            }
            
            throw new Error(`Failed to create ${type}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Save file content
     */
    public async saveFile(path: string, content: string): Promise<any> {
        if (!this.isConnected) {
            throw new Error('Not connected to JupyterHub server');
        }
        
        try {
            // Normalize path
            if (!path.startsWith('/')) {
                path = `/${path}`;
            }
            
            const data = {
                content: content,
                type: 'file'
            };
            
            const response = await axios.put(`${this.apiBaseUrl}/contents${path}`, data, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.status === 200 && response.data) {
                return response.data;
            }
            
            throw new Error('Failed to save file');
        } catch (error) {
            console.error(`Failed to save file at path ${path}:`, error);
            
            // Check for unauthorized error - likely invalid or expired token
            if (this.isCredentialError(error)) {
                vscode.window.showErrorMessage('JupyterHub credentials are invalid or expired. Please reconnect with new credentials.');
                this.isConnected = false;
                vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
                throw new Error('Invalid credentials');
            }
            
            throw new Error(`Failed to save file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Delete a file or directory
     */
    public async deleteItem(path: string): Promise<boolean> {
        if (!this.isConnected) {
            throw new Error('Not connected to JupyterHub server');
        }
        
        try {
            // Normalize path
            if (!path.startsWith('/')) {
                path = `/${path}`;
            }
            
            const response = await axios.delete(`${this.apiBaseUrl}/contents${path}`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });
            
            return response.status === 204;
        } catch (error) {
            console.error(`Failed to delete item at path ${path}:`, error);
            
            // Check for unauthorized error - likely invalid or expired token
            if (this.isCredentialError(error)) {
                vscode.window.showErrorMessage('JupyterHub credentials are invalid or expired. Please reconnect with new credentials.');
                this.isConnected = false;
                vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
                throw new Error('Invalid credentials');
            }
            
            throw new Error(`Failed to delete item: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Check if the connection is active
     */
    public isActive(): boolean {
        return this.isConnected;
    }
    
    /**
     * Get server information
     */
    public getServerInfo(): { serverUrl: string; username?: string } {
        return {
            serverUrl: this.serverUrl,
            username: this.username
        };
    }

    // Helper to check if an API error is due to invalid credentials
    private isCredentialError(error: any): boolean {
        return axios.isAxiosError(error) && 
               (error.response?.status === 401 || error.response?.status === 403);
    }
} 