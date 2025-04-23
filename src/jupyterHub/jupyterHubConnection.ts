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
     * Creates an HTTPS agent that accepts self-signed certificates when configured to do so
     */
    private getHttpsAgent() {
        // Create a custom HTTPS agent 
        const https = require('https');
        
        // Check if we should allow invalid certificates
        const allowSelfSigned = vscode.workspace.getConfiguration('jupyterhub').get<boolean>('allowSelfSignedCertificates', true);
        
        // Log the certificate verification setting
        console.log(`Certificate verification setting: allowSelfSignedCertificates=${allowSelfSigned}`);
        
        if (allowSelfSigned) {
            // Use Node's built-in TLS options to bypass certificate validation when allowed
            return new https.Agent({
                rejectUnauthorized: false,
                // Additional options to handle problematic certificate chains
                checkServerIdentity: () => undefined, // Skip hostname checks
                secureOptions: require('constants').SSL_OP_NO_TLSv1_2, // Try forcing TLS 1.3 or 1.1
                maxVersion: 'TLSv1.3',
                minVersion: 'TLSv1'
            });
        } else {
            // Use default certificate validation behavior
            return new https.Agent({
                rejectUnauthorized: true
            });
        }
    }

    /**
     * Safely stringifies an object, handling circular references
     */
    private safeStringify(obj: any): string {
        try {
            return JSON.stringify(obj);
        } catch (error) {
            return "[Cannot stringify - circular reference]";
        }
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
            
            // Check if we should allow invalid certificates
            const allowSelfSigned = vscode.workspace.getConfiguration('jupyterhub').get<boolean>('allowSelfSignedCertificates', true);
            
            console.log(`Attempting to connect to JupyterHub server at ${this.serverUrl} with timeout ${timeout}ms, certificate verification is ${allowSelfSigned ? 'disabled' : 'enabled'}`);

            // Disable Node.js certificate validation globally for this request if allowed
            let originalTlsSetting;
            if (allowSelfSigned) {
                originalTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            }
            
            // Validate connection by getting user info
            const response = await axios.get(`${this.serverUrl}/hub/api/user`, {
                headers: {
                    'Authorization': `token ${this.token}`
                },
                timeout: timeout,
                // Configure HTTPS agent based on settings
                httpsAgent: this.getHttpsAgent()
            });
            
            if (response.status === 200 && response.data) {
                this.username = response.data.name;
                this.apiBaseUrl = `${this.serverUrl}/user/${this.username}/api`;
                this.isConnected = true;
                console.log(`Successfully connected to JupyterHub as user: ${this.username}`);
                console.log(`API base URL: ${this.apiBaseUrl}`);

                // Reset NODE_TLS_REJECT_UNAUTHORIZED to its original value if changed
                if (allowSelfSigned && originalTlsSetting !== undefined) {
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsSetting;
                }
                
                return true;
            }
            
            // Reset NODE_TLS_REJECT_UNAUTHORIZED to its original value if changed
            if (allowSelfSigned && originalTlsSetting !== undefined) {
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsSetting;
            }
            
            return false;
        } catch (error) {
            // Check if we should allow invalid certificates 
            const allowSelfSigned = vscode.workspace.getConfiguration('jupyterhub').get<boolean>('allowSelfSignedCertificates', true);
            
            // Reset NODE_TLS_REJECT_UNAUTHORIZED to its default value if it was changed
            if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' && allowSelfSigned) {
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
            }
            
            console.error('Failed to connect to JupyterHub server:', error);
            
            // More detailed error logging
            if (axios.isAxiosError(error)) {
                console.error(`Axios Error Details:`);
                console.error(`- Message: ${error.message}`);
                console.error(`- Code: ${error.code}`);
                console.error(`- Request URL: ${error.config?.url}`);
                
                if (error.response) {
                    console.error(`- Status: ${error.response.status}`);
                    console.error(`- Status Text: ${error.response.statusText}`);
                    try {
                        // Safely stringify response data
                        const safeData = this.safeStringify(error.response.data);
                        console.error(`- Response Data: ${safeData}`);
                    } catch (jsonError) {
                        console.error(`- Response Data: [Cannot stringify - circular reference]`);
                    }
                    
                    try {
                        // Only log basic header info to avoid circular references
                        const safeHeaders: Record<string, string> = {};
                        for (const [key, value] of Object.entries(error.response.headers)) {
                            safeHeaders[key] = String(value);
                        }
                        console.error(`- Response Headers: ${this.safeStringify(safeHeaders)}`);
                    } catch (jsonError) {
                        console.error(`- Response Headers: [Cannot stringify - circular reference]`);
                    }
                } else if (error.request) {
                    console.error('- No response received from server');
                    console.error(`- Request details available but not logged to avoid circular reference`);
                }
                
                // Add specific error message for certificate errors
                if (error.message.includes('certificate') || error.message.includes('CERT_')) {
                    console.error('- Certificate validation error detected.');
                    if (allowSelfSigned) {
                        console.error('- SSL certificate verification is already disabled, but the error persists.');
                        vscode.window.showErrorMessage('SSL certificate error when connecting to JupyterHub server, even though certificate validation is disabled. There may be a network issue or proxy intercepting the connection.');
                    } else {
                        console.error('- Certificate verification is currently enabled. You can disable it in settings.');
                        const action = await vscode.window.showErrorMessage(
                            'SSL certificate validation error. This server may use a self-signed certificate.',
                            'Disable Certificate Validation',
                            'Open Settings',
                            'Cancel'
                        );
                        
                        if (action === 'Disable Certificate Validation') {
                            // Update the setting
                            await vscode.workspace.getConfiguration('jupyterhub').update(
                                'allowSelfSignedCertificates',
                                true,
                                vscode.ConfigurationTarget.Global
                            );
                            vscode.window.showInformationMessage(
                                'Certificate validation disabled. Please try connecting again.'
                            );
                        } else if (action === 'Open Settings') {
                            await vscode.commands.executeCommand(
                                'workbench.action.openSettings',
                                'jupyterhub.allowSelfSignedCertificates'
                            );
                        }
                    }
                }
            }
            
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
                timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000),
                // Allow self-signed certificates
                httpsAgent: this.getHttpsAgent()
            });
            
            if (response.status === 200 && response.data) {
                return response.data.content || [];
            }
            
            return [];
        } catch (error) {
            console.error(`Failed to list contents at path ${path}:`, error);
            
            // More detailed error logging
            if (axios.isAxiosError(error)) {
                console.error(`Axios Error: ${error.message}`);
                if (error.response) {
                    console.error(`Status: ${error.response.status}`);
                    console.error(`Data: ${this.safeStringify(error.response.data)}`);
                } else if (error.request) {
                    console.error('No response received from server');
                }
            }
            
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
                    timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000),
                    // Allow self-signed certificates
                    httpsAgent: this.getHttpsAgent()
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
                        timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000),
                        // Allow self-signed certificates
                        httpsAgent: this.getHttpsAgent()
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
            // For 404 when explicitly checking file existence, we want a cleaner log
            const isCheckingFileExists = path.toString().includes('api/contents');
            const is404 = axios.isAxiosError(error) && error.response?.status === 404;
            
            if (is404) {
                // 404 errors are expected in some workflows (checking if files exist)
                console.log(`File not found at path ${path} (404)`);
            } else {
                // Log other errors as actual errors
                console.error(`Failed to get file content at path ${path}:`, error);
                
                // More detailed but safe error logging
                if (axios.isAxiosError(error)) {
                    console.error(`Axios Error: ${error.message}`);
                    if (error.response) {
                        console.error(`Status: ${error.response.status}`);
                        console.error(`Data: ${this.safeStringify(error.response.data)}`);
                    } else if (error.request) {
                        console.error('No response received from server');
                    }
                }
            }
            
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
            
            console.log(`Creating ${type} with EXACT name at: ${path}`);
            
            // DIRECTLY create the item at the exact path with PUT
            if (type === 'directory') {
                const directoryData = {
                    type: 'directory'
                };
                
                const response = await axios.put(`${this.apiBaseUrl}/contents${path}`, directoryData, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000),
                    // Allow self-signed certificates
                    httpsAgent: this.getHttpsAgent()
                });
                
                console.log(`Directory created successfully at exact path: ${path}`);
                return response.data;
            }
            
            // For files, use PUT directly to the path
            if (type === 'file') {
                // Get filename for content type handling
                const fileName = path.substring(path.lastIndexOf('/') + 1);
                
                // Handle different file types
                if (fileName.endsWith('.ipynb')) {
                    // For notebooks, create with exact format required by Jupyter API
                    console.log(`Creating notebook with PUT to exact path: ${path}`);
                    
                    const notebookData = {
                        type: "notebook",
                        content: {
                            cells: [],
                            metadata: {
                                kernelspec: {
                                    display_name: "Python 3",
                                    language: "python",
                                    name: "python3"
                                },
                                language_info: {
                                    codemirror_mode: {
                                        name: "ipython",
                                        version: 3
                                    },
                                    file_extension: ".py",
                                    mimetype: "text/x-python",
                                    name: "python",
                                    nbconvert_exporter: "python",
                                    pygments_lexer: "ipython3",
                                    version: "3.8.0"
                                }
                            },
                            nbformat: 4,
                            nbformat_minor: 5
                        }
                    };
                    
                    // Only use provided content if it's valid notebook JSON
                    if (content) {
                        try {
                            const jsonContent = JSON.parse(content);
                            if (jsonContent.cells && jsonContent.metadata && jsonContent.nbformat) {
                                notebookData.content = jsonContent;
                            }
                        } catch (e) {
                            // Invalid JSON, already using default notebook template
                        }
                    }
                    
                    const response = await axios.put(`${this.apiBaseUrl}/contents${path}`, notebookData, {
                        headers: {
                            'Authorization': `token ${this.token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000),
                        // Allow self-signed certificates
                        httpsAgent: this.getHttpsAgent()
                    });
                    
                    if (response.data && response.data.path) {
                        console.log(`Notebook created successfully at: ${response.data.path}`);
                    }
                    
                    return response.data;
                } else {
                    // Regular text files
                    console.log(`Creating text file with PUT to exact path: ${path}`);
                    
                    const fileData = {
                        type: "file",
                        format: "text",
                        content: content || ""
                    };
                    
                    const response = await axios.put(`${this.apiBaseUrl}/contents${path}`, fileData, {
                        headers: {
                            'Authorization': `token ${this.token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000),
                        // Allow self-signed certificates
                        httpsAgent: this.getHttpsAgent()
                    });
                    
                    if (response.data && response.data.path) {
                        console.log(`Text file created successfully at: ${response.data.path}`);
                    }
                    
                    return response.data;
                }
            }
            
            throw new Error(`Unsupported item type: ${type}`);
        } catch (error) {
            console.error(`Failed to create ${type} at path ${path}:`, error);
            
            if (this.isCredentialError(error)) {
                vscode.window.showErrorMessage('JupyterHub credentials are invalid or expired. Please reconnect with new credentials.');
                this.isConnected = false;
                vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
                throw new Error('Invalid credentials');
            } else if (this.isTimeoutError(error)) {
                vscode.window.showErrorMessage(`Operation timed out. Please check your network connection and server status.`);
                throw new Error('Connection timeout');
            } else {
                // Show detailed error message with response data
                let errorMessage = "";
                if (axios.isAxiosError(error) && error.response) {
                    errorMessage = `${error.message} (Status: ${error.response.status}`;
                    try {
                        errorMessage += `, Data: ${this.safeStringify(error.response.data)})`;
                    } catch (e) {
                        errorMessage += ")";
                    }
                } else {
                    errorMessage = error instanceof Error ? error.message : String(error);
                }
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
            
            console.log(`Saving file ${path} with content length: ${content.length}`);
            
            // For all files, we must use 'text' format for PUT requests
            const data: any = {
                type: 'file',
                content: content,
                format: 'text'
            };
            
            // Log the request format for debugging
            console.log(`PUT request to ${this.apiBaseUrl}/contents${path} using format: text`);
            
            const response = await axios.put(`${this.apiBaseUrl}/contents${path}`, data, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                },
                timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000),
                // Allow self-signed certificates
                httpsAgent: this.getHttpsAgent()
            });
            
            if (response.status === 200 && response.data) {
                console.log(`File ${path} saved successfully`);
                return response.data;
            }
            
            throw new Error('Failed to save file');
        } catch (error) {
            console.error(`Failed to save file at path ${path}:`, error);
            
            // Add more detailed error information for debugging
            if (axios.isAxiosError(error) && error.response) {
                console.error(`Response status: ${error.response.status}`);
                console.error(`Response data:`, this.safeStringify(error.response.data));
            }
            
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
                    ? `${error.message} (${error.response.status}: ${this.safeStringify(error.response.data)})`
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
                timeout: vscode.workspace.getConfiguration('jupyterhub').get<number>('connectionTimeout', 10000),
                // Allow self-signed certificates
                httpsAgent: this.getHttpsAgent()
            });
            
            return response.status === 204;
        } catch (error) {
            console.error(`Failed to delete item at path ${path}:`, error);
            
            // More detailed but safe error logging
            if (axios.isAxiosError(error)) {
                console.error(`Axios Error: ${error.message}`);
                if (error.response) {
                    console.error(`Status: ${error.response.status}`);
                    console.error(`Data: ${this.safeStringify(error.response.data)}`);
                } else if (error.request) {
                    console.error('No response received from server');
                }
            }
            
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