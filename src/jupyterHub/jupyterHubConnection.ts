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
            
            // Get timeout from configuration
            const timeout = vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000);
            
            // Validate connection by getting user info
            const response = await axios.get(`${this.serverUrl}/hub/api/user`, {
                headers: {
                    'Authorization': `token ${this.token}`
                },
                timeout: timeout
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
            if (this.isCredentialError(error)) {
                vscode.window.showErrorMessage('JupyterHub credentials are invalid or expired. Please reconnect with new credentials.');
                // Dispatch a custom event for credential invalidation
                const invalidCredentialsEvent = new vscode.EventEmitter<void>();
                vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
            } else if (this.isTimeoutError(error)) {
                vscode.window.showErrorMessage(`Connection to JupyterHub server timed out. Please check your network connection and server status.`);
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
                },
                timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000)
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
            } else if (this.isTimeoutError(error)) {
                vscode.window.showErrorMessage(`Operation timed out. Please check your network connection and server status.`);
                throw new Error('Connection timeout');
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
            // Normalize path - ensure it starts with a slash and remove any double slashes
            if (!path.startsWith('/')) {
                path = `/${path}`;
            }
            path = path.replace(/\/+/g, '/');
            
            // For JupyterHub API, we might need to remove leading slash in some cases
            // but we'll first try with the slash as is
            const apiPath = path;
            
            console.log(`Getting file content from ${this.apiBaseUrl}/contents${apiPath}`);
            
            try {
                const response = await axios.get(`${this.apiBaseUrl}/contents${apiPath}`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        content: 1
                    },
                    timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000)
                });
                
                if (response.status === 200 && response.data) {
                    console.log(`Successfully retrieved file content for ${path}, format: ${response.data.format}`);
                    return response.data;
                }
            } catch (error) {
                // If path with leading slash fails, try without the leading slash
                if (path.startsWith('/')) {
                    const altPath = path.substring(1);
                    console.log(`Primary request failed, trying alternate path: ${this.apiBaseUrl}/contents/${altPath}`);
                    
                    const altResponse = await axios.get(`${this.apiBaseUrl}/contents/${altPath}`, {
                        headers: {
                            'Authorization': `token ${this.token}`,
                            'Content-Type': 'application/json'
                        },
                        params: {
                            content: 1
                        },
                        timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000)
                    });
                    
                    if (altResponse.status === 200 && altResponse.data) {
                        console.log(`Successfully retrieved file content using alternate path for ${path}`);
                        return altResponse.data;
                    }
                } else {
                    // If we're here, the initial request failed and we've already tried the alternative
                    throw error;
                }
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
            } else if (this.isTimeoutError(error)) {
                vscode.window.showErrorMessage(`Operation timed out. Please check your network connection and server status.`);
                throw new Error('Connection timeout');
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
            // Normalize path
            if (!path.startsWith('/')) {
                path = `/${path}`;
            }
            
            // Get the directory and filename
            const lastSlashIndex = path.lastIndexOf('/');
            const directory = path.substring(0, lastSlashIndex) || '/';
            const name = path.substring(lastSlashIndex + 1);
            
            console.log(`Creating ${type} in directory "${directory}" with name "${name}"`);
            
            const data: any = {
                type: type,
                name: name
            };
            
            if (type === 'file' && content !== undefined) {
                // Special handling for notebook files
                if (name.endsWith('.ipynb')) {
                    // Use JSON format for notebooks with proper structure
                    data.format = 'json';
                    data.content = {
                        cells: [],
                        metadata: {
                            kernelspec: {
                                display_name: "Python 3",
                                language: "python",
                                name: "python3"
                            }
                        },
                        nbformat: 4,
                        nbformat_minor: 4
                    };
                } else {
                    // Regular text files
                    data.content = content;
                    data.format = 'text';
                }
            }
            
            console.log(`POST request to ${this.apiBaseUrl}/contents${directory} with data:`, JSON.stringify(data));
            
            const response = await axios.post(`${this.apiBaseUrl}/contents${directory}`, data, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                },
                timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000)
            });
            
            if (response.status === 201 && response.data) {
                console.log(`${type} created successfully at: ${response.data.path || path}`);
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
            } else if (this.isTimeoutError(error)) {
                vscode.window.showErrorMessage(`Operation timed out. Please check your network connection and server status.`);
                throw new Error('Connection timeout');
            } else {
                // Show detailed error message for debugging
                const errorMessage = axios.isAxiosError(error) && error.response 
                    ? `${error.message} (${error.response.status}: ${JSON.stringify(error.response.data)})`
                    : `${error instanceof Error ? error.message : String(error)}`;
                vscode.window.showErrorMessage(`Failed to create ${type}: ${errorMessage}`);
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
            
            // First get the current file to maintain its format
            const currentFile = await this.getFileContent(path);
            
            // Properly format the request according to JupyterHub API spec
            const data = {
                content: content,
                type: 'file',
                format: 'text'  // Explicitly set format to text
            };
            
            console.log(`Saving file ${path} with content length: ${content.length}`);
            
            const response = await axios.put(`${this.apiBaseUrl}/contents${path}`, data, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                },
                timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000)
            });
            
            if (response.status === 200 && response.data) {
                console.log(`File ${path} saved successfully`);
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
            } else if (this.isTimeoutError(error)) {
                vscode.window.showErrorMessage(`Operation timed out. Please check your network connection and server status.`);
                throw new Error('Connection timeout');
            } else {
                // Show detailed error message to help debug
                const errorMessage = axios.isAxiosError(error) && error.response 
                    ? `${error.message} (${error.response.status}: ${JSON.stringify(error.response.data)})`
                    : `${error instanceof Error ? error.message : String(error)}`;
                vscode.window.showErrorMessage(`Failed to save file: ${errorMessage}`);
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
                },
                timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000)
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
            } else if (this.isTimeoutError(error)) {
                vscode.window.showErrorMessage(`Operation timed out. Please check your network connection and server status.`);
                throw new Error('Connection timeout');
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
    
    private isTimeoutError(error: any): boolean {
        return axios.isAxiosError(error) && 
               (error.code === 'ECONNABORTED' || error.message.includes('timeout'));
    }
}