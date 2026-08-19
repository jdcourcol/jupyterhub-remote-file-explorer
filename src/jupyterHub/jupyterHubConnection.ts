import * as vscode from 'vscode';
import axios from 'axios';

/**
 * Options for establishing a connection to a JupyterHub server
 */
export interface JupyterHubConnectionOptions {
  /** URL of the JupyterHub server */
  serverUrl: string;
  /** Authentication token for the JupyterHub API */
  token: string;
  /** Optional username (will be determined from the API if not provided) */
  username?: string;
}

/**
 * Interface for JupyterHub connection operations.
 * Used for dependency injection in tests.
 */
export interface JupyterHubConnectionInterface {
  /**
   * Establishes a connection to the JupyterHub server
   * @returns A promise that resolves to true if connection was successful
   */
  connect(): Promise<boolean>;

  /**
   * Disconnects from the JupyterHub server
   */
  disconnect(): void;

  /**
   * Checks if the connection to the server is active
   * @returns Whether the connection is active
   */
  isActive(): boolean;

  /**
   * Retrieves content of a file
   * @param path Path to the file
   * @returns Promise resolving to file content
   */
  getFileContent(path: string): Promise<any>;

  /**
   * Saves content to a file
   * @param path Path to the file
   * @param content Content to save
   * @returns Promise resolving when save is complete
   */
  saveFile(path: string, content: string): Promise<any>;

  /**
   * Lists contents of a directory
   * @param path Path to the directory
   * @returns Promise resolving to array of content items
   */
  listContents(path: string): Promise<any[]>;

  /**
   * Gets child items of a directory
   * @param path Path to the directory
   * @returns Promise resolving to array of paths
   */
  getChildren(path: string): Promise<string[]>;

  /**
   * Gets metadata for a file or directory
   * @param path Path to the item
   * @returns Promise resolving to metadata object
   */
  getMetadata(path: string): Promise<any>;

  /**
   * Creates a new file or directory
   * @param path Path where to create the item
   * @param type Type of item to create ('file' or 'directory')
   * @param content Optional content for files
   * @returns Promise resolving to created item data
   */
  createItem(path: string, type: 'file' | 'directory', content?: string): Promise<any>;

  /**
   * Deletes a file or directory
   * @param path Path to the item to delete
   * @returns Promise resolving when delete is complete
   */
  deleteItem(path: string): Promise<void>;

  /**
   * Gets information about the connected server
   * @returns Object containing server URL and username
   */
  getServerInfo(): { serverUrl: string; username?: string };

  /**
   * Checks if an error is related to invalid credentials
   * @param error - The error to check
   * @returns True if the error is credential-related, false otherwise
   */
  isCredentialError(error: any): boolean;

  /**
   * Checks if an error is related to a connection timeout
   * @param error - The error to check
   * @returns True if the error is timeout-related, false otherwise
   */
  isTimeoutError(error: any): boolean;
}

/**
 * Manages the connection to a JupyterHub server and provides methods to interact with its contents API
 */
export class JupyterHubConnection implements JupyterHubConnectionInterface {
  private serverUrl: string;
  private token: string;
  private username?: string;
  private isConnected: boolean = false;
  private apiBaseUrl: string = '';

  /**
   * Creates a new JupyterHub connection instance
   * @param options - Connection configuration options
   */
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
    const allowSelfSigned = vscode.workspace
      .getConfiguration('jupyterhub')
      .get<boolean>('allowSelfSignedCertificates', true);

    if (allowSelfSigned) {
      // Use Node's built-in TLS options to bypass certificate validation when allowed
      return new https.Agent({
        rejectUnauthorized: false,
        // Additional options to handle problematic certificate chains
        checkServerIdentity: () => undefined, // Skip hostname checks
        secureOptions: require('constants').SSL_OP_NO_TLSv1_2, // Try forcing TLS 1.3 or 1.1
        maxVersion: 'TLSv1.3',
        minVersion: 'TLSv1',
      });
    } else {
      // Use default certificate validation behavior
      return new https.Agent({
        rejectUnauthorized: true,
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
      return '[Cannot stringify - circular reference]';
    }
  }

  /**
   * Establishes a connection to the JupyterHub server
   * @returns A promise that resolves to true if connection was successful, false otherwise
   * @throws Error if the connection fails
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
      const timeout = vscode.workspace
        .getConfiguration('jupyterhub')
        .get<number>('connectionTimeout', 10000);

      // Check if we should allow invalid certificates
      const allowSelfSigned = vscode.workspace
        .getConfiguration('jupyterhub')
        .get<boolean>('allowSelfSignedCertificates', true);

      // Disable Node.js certificate validation globally for this request if allowed
      let originalTlsSetting;
      if (allowSelfSigned) {
        originalTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      }

      // Validate connection by getting user info
      const response = await axios.get(`${this.serverUrl}/hub/api/user`, {
        headers: {
          Authorization: `token ${this.token}`,
        },
        timeout: timeout,
        // Configure HTTPS agent based on settings
        httpsAgent: this.getHttpsAgent(),
      });

      if (response.status === 200 && response.data) {
        this.username = response.data.name;

        // JupyterHub named servers expose their complete route in the user model.
        const servers = response.data.servers as
          | Record<string, { url?: string; ready?: boolean }>
          | undefined;
        const serverEntries = servers ? Object.values(servers) : [];
        const activeServer =
          serverEntries.find(server => server.ready && server.url) ||
          serverEntries.find(server => server.url);

        if (activeServer?.url) {
          const serverUrl = new URL(activeServer.url, `${this.serverUrl}/`);
          this.apiBaseUrl = `${serverUrl.toString().replace(/\/$/, '')}/api`;
        } else {
          this.apiBaseUrl = `${this.serverUrl}/user/${this.username}/api`;
        }
        this.isConnected = true;

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
      // Reset NODE_TLS_REJECT_UNAUTHORIZED to its original value if it was changed
      const allowSelfSigned = vscode.workspace
        .getConfiguration('jupyterhub')
        .get<boolean>('allowSelfSignedCertificates', true);

      if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' && allowSelfSigned) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
      }

      console.error('Failed to connect to JupyterHub server:', error);

      // Continue with existing error handling code
      if (axios.isAxiosError(error) && error.message.includes('certificate')) {
        if (allowSelfSigned) {
          vscode.window.showErrorMessage(
            'SSL certificate error when connecting to JupyterHub server, even though certificate validation is disabled. There may be a network issue or proxy intercepting the connection.'
          );
        } else {
          const action = await vscode.window.showErrorMessage(
            'SSL certificate validation error. This server may use a self-signed certificate.',
            'Disable Certificate Validation',
            'Open Settings',
            'Cancel'
          );

          if (action === 'Disable Certificate Validation') {
            // Update the setting
            await vscode.workspace
              .getConfiguration('jupyterhub')
              .update('allowSelfSignedCertificates', true, vscode.ConfigurationTarget.Global);
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
        return false;
      }

      // Check for unauthorized error - likely invalid or expired token
      if (this.isCredentialError(error)) {
        vscode.window.showErrorMessage(
          'JupyterHub credentials are invalid or expired. Please reconnect with new credentials.'
        );
        // Dispatch a custom event for credential invalidation
        const invalidCredentialsEvent = new vscode.EventEmitter<void>();
        vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
      } else if (this.isTimeoutError(error)) {
        vscode.window.showErrorMessage(
          `Connection to JupyterHub server timed out. Please check your network connection and server status.`
        );
      } else {
        vscode.window.showErrorMessage(
          `Failed to connect to JupyterHub server: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return false;
    }
  }

  /**
   * Disconnects from the JupyterHub server
   */
  public disconnect(): void {
    this.isConnected = false;
  }

  /**
   * Lists the contents at the specified path on the JupyterHub server
   * @param path - The directory path to list
   * @returns A promise that resolves to an array of content items
   * @throws Error if not connected or if the operation fails
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
          Authorization: `token ${this.token}`,
        },
        timeout: vscode.workspace
          .getConfiguration('jupyterhub')
          .get<number>('connectionTimeout', 10000),
        httpsAgent: this.getHttpsAgent(),
      });

      if (response.status === 200 && response.data) {
        return response.data.content || [];
      }

      return [];
    } catch (error) {
      console.error(`Failed to list contents at path ${path}:`, error);

      // Check for unauthorized error - likely invalid or expired token
      if (this.isCredentialError(error)) {
        vscode.window.showErrorMessage(
          'JupyterHub credentials are invalid or expired. Please reconnect with new credentials.'
        );
        this.isConnected = false;
        vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
        throw new Error('Invalid credentials');
      } else if (this.isTimeoutError(error)) {
        vscode.window.showErrorMessage(
          `Operation timed out. Please check your network connection and server status.`
        );
        throw new Error('Connection timeout');
      }

      throw new Error(
        `Failed to list contents: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retrieves the content of a file from the JupyterHub server
   * @param path - The path of the file to retrieve
   * @returns A promise that resolves to the file content object
   * @throws Error if not connected, if the file is not found, or if the operation fails
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

      try {
        const response = await axios.get(`${this.apiBaseUrl}/contents${apiPath}`, {
          headers: {
            Authorization: `token ${this.token}`,
            'Content-Type': 'application/json',
          },
          params: {
            content: 1,
          },
          timeout: vscode.workspace
            .getConfiguration('jupyterhub')
            .get<number>('connectionTimeout', 10000),
          httpsAgent: this.getHttpsAgent(),
        });

        if (response.status === 200 && response.data) {
          return response.data;
        }
      } catch (error) {
        // If path with leading slash fails, try without the leading slash
        if (path.startsWith('/')) {
          const altPath = path.substring(1);

          const altResponse = await axios.get(`${this.apiBaseUrl}/contents/${altPath}`, {
            headers: {
              Authorization: `token ${this.token}`,
              'Content-Type': 'application/json',
            },
            params: {
              content: 1,
            },
            timeout: vscode.workspace
              .getConfiguration('jupyterhub')
              .get<number>('connectionTimeout', 10000),
            httpsAgent: this.getHttpsAgent(),
          });

          if (altResponse.status === 200 && altResponse.data) {
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
      const is404 = axios.isAxiosError(error) && error.response?.status === 404;

      // Check for unauthorized error - likely invalid or expired token
      if (this.isCredentialError(error)) {
        vscode.window.showErrorMessage(
          'JupyterHub credentials are invalid or expired. Please reconnect with new credentials.'
        );
        this.isConnected = false;
        vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
        throw new Error('Invalid credentials');
      } else if (this.isTimeoutError(error)) {
        vscode.window.showErrorMessage(
          `Operation timed out. Please check your network connection and server status.`
        );
        throw new Error('Connection timeout');
      }

      throw new Error(
        `Failed to get file content: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Creates a file or directory on the JupyterHub server
   * @param path - The path of the item to create
   * @param type - The type of item ('file' or 'directory')
   * @param content - The content for files (ignored for directories)
   * @returns A promise that resolves to the created item data
   * @throws Error if not connected or if the operation fails
   */
  public async createItem(
    path: string,
    type: 'file' | 'directory',
    content?: string
  ): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to JupyterHub server');
    }

    try {
      // Check for unsupported item types
      if (type !== 'file' && type !== 'directory') {
        throw new Error(`Unsupported item type: ${type}`);
      }

      // Normalize path
      if (!path.startsWith('/')) {
        path = `/${path}`;
      }

      // Log creation attempt
      console.log(`Creating ${type} at path: ${path}`);

      // Create the item using PUT request - this works for both files and directories
      // and ensures direct creation with the correct name
      let requestData: any = {};

      if (type === 'directory') {
        // Directory creation
        requestData = {
          type: 'directory',
        };
      } else {
        // type === 'file'
        // File creation
        const isNotebook = path.endsWith('.ipynb');

        if (isNotebook) {
          // For notebook files, we need proper JSON structure
          // If content is provided, parse it, otherwise create empty notebook
          const notebookContent = content
            ? JSON.parse(content)
            : {
                cells: [],
                metadata: {
                  kernelspec: {
                    display_name: 'Python 3',
                    language: 'python',
                    name: 'python3',
                  },
                },
                nbformat: 4,
                nbformat_minor: 4,
              };

          requestData = {
            type: 'notebook',
            content: notebookContent,
            format: 'json',
          };
        } else {
          // Regular text file
          requestData = {
            type: 'file',
            content: content || '',
            format: 'text',
          };
        }
      }

      // Make the PUT request
      const response = await axios.put(`${this.apiBaseUrl}/contents${path}`, requestData, {
        headers: {
          Authorization: `token ${this.token}`,
          'Content-Type': 'application/json',
        },
        timeout: vscode.workspace
          .getConfiguration('jupyterhub')
          .get<number>('connectionTimeout', 10000),
        httpsAgent: this.getHttpsAgent(),
      });

      if (response.status === 201 || response.status === 200) {
        console.log(`Successfully created ${type} at path: ${path}`);
        return response.data;
      }

      throw new Error(`Failed to create ${type}`);
    } catch (error) {
      console.error(`Failed to create ${type} at path ${path}:`, error);

      // Check for unauthorized error - likely invalid or expired token
      if (this.isCredentialError(error)) {
        vscode.window.showErrorMessage(
          'JupyterHub credentials are invalid or expired. Please reconnect with new credentials.'
        );
        this.isConnected = false;
        vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
        throw new Error('Invalid credentials');
      } else if (this.isTimeoutError(error)) {
        vscode.window.showErrorMessage(
          `Operation timed out. Please check your network connection and server status.`
        );
        throw new Error('Connection timeout');
      }

      throw new Error(
        `Failed to create ${type}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Saves content to an existing file on the JupyterHub server
   * @param path - The path of the file to save
   * @param content - The content to save
   * @returns A promise that resolves to the saved file data
   * @throws Error if not connected or if the operation fails
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

      // For all files, we must use 'text' format for PUT requests
      const data: any = {
        type: 'file',
        content: content,
        format: 'text',
      };

      const response = await axios.put(`${this.apiBaseUrl}/contents${path}`, data, {
        headers: {
          Authorization: `token ${this.token}`,
          'Content-Type': 'application/json',
        },
        timeout: vscode.workspace
          .getConfiguration('jupyterhub')
          .get<number>('connectionTimeout', 10000),
        httpsAgent: this.getHttpsAgent(),
      });

      if (response.status === 200 && response.data) {
        return response.data;
      }

      throw new Error('Failed to save file');
    } catch (error) {
      // Check for unauthorized error - likely invalid or expired token
      if (this.isCredentialError(error)) {
        vscode.window.showErrorMessage(
          'JupyterHub credentials are invalid or expired. Please reconnect with new credentials.'
        );
        this.isConnected = false;
        vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
        throw new Error('Invalid credentials');
      } else if (this.isTimeoutError(error)) {
        vscode.window.showErrorMessage(
          `Operation timed out. Please check your network connection and server status.`
        );
        throw new Error('Connection timeout');
      } else {
        // Show detailed error message to help debug
        const errorMessage =
          axios.isAxiosError(error) && error.response
            ? `${error.message} (${error.response.status}: ${JSON.stringify(error.response.data)})`
            : `${error instanceof Error ? error.message : String(error)}`;
        vscode.window.showErrorMessage(`Failed to save file: ${errorMessage}`);
      }

      throw new Error(
        `Failed to save file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get children paths from a directory
   * @param path - The path of the directory
   * @returns A promise that resolves to an array of child paths
   * @throws Error if not connected or if the operation fails
   */
  public async getChildren(path: string): Promise<string[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to JupyterHub server');
    }

    try {
      const contents = await this.listContents(path);
      return contents.map(item => {
        const itemPath = path === '/' ? `/${item.name}` : `${path}/${item.name}`;
        return itemPath;
      });
    } catch (error) {
      console.error(`Failed to get children for path ${path}:`, error);
      throw new Error(
        `Failed to get children: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get metadata for an item
   * @param path - The path of the item
   * @returns A promise that resolves to the item metadata
   * @throws Error if not connected or if the operation fails
   */
  public async getMetadata(path: string): Promise<any> {
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
          Authorization: `token ${this.token}`,
        },
        timeout: vscode.workspace
          .getConfiguration('jupyterhub')
          .get<number>('connectionTimeout', 10000),
        httpsAgent: this.getHttpsAgent(),
      });

      if (response.status === 200 && response.data) {
        return response.data;
      }

      throw new Error('Failed to get metadata');
    } catch (error) {
      console.error(`Failed to get metadata for path ${path}:`, error);

      if (this.isCredentialError(error)) {
        vscode.window.showErrorMessage(
          'JupyterHub credentials are invalid or expired. Please reconnect with new credentials.'
        );
        this.isConnected = false;
        vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
        throw new Error('Invalid credentials');
      } else if (this.isTimeoutError(error)) {
        vscode.window.showErrorMessage(
          `Operation timed out. Please check your network connection and server status.`
        );
        throw new Error('Connection timeout');
      }

      throw new Error(
        `Failed to get metadata: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Deletes a file or directory on the JupyterHub server
   * @param path - The path of the item to delete
   * @returns A promise that resolves when deletion is complete
   * @throws Error if not connected or if the operation fails
   */
  public async deleteItem(path: string): Promise<void> {
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
          Authorization: `token ${this.token}`,
        },
        timeout: vscode.workspace
          .getConfiguration('jupyterhub')
          .get<number>('connectionTimeout', 10000),
        httpsAgent: this.getHttpsAgent(),
      });

      if (response.status !== 204) {
        throw new Error('Failed to delete item');
      }
    } catch (error) {
      console.error(`Failed to delete item at path ${path}:`, error);

      // Check for unauthorized error - likely invalid or expired token
      if (this.isCredentialError(error)) {
        vscode.window.showErrorMessage(
          'JupyterHub credentials are invalid or expired. Please reconnect with new credentials.'
        );
        this.isConnected = false;
        vscode.commands.executeCommand('jupyterhub-remote-file-explorer.updateCredentials');
        throw new Error('Invalid credentials');
      } else if (this.isTimeoutError(error)) {
        vscode.window.showErrorMessage(
          `Operation timed out. Please check your network connection and server status.`
        );
        throw new Error('Connection timeout');
      }

      throw new Error(
        `Failed to delete item: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Checks if the connection to the JupyterHub server is active
   * @returns True if connected, false otherwise
   */
  public isActive(): boolean {
    return this.isConnected;
  }

  /**
   * Gets information about the connected server
   * @returns Object containing server URL and username
   */
  public getServerInfo(): { serverUrl: string; username?: string } {
    return {
      serverUrl: this.serverUrl,
      username: this.username,
    };
  }

  /**
   * Checks if an error is related to invalid credentials
   * @param error - The error to check
   * @returns True if the error is credential-related, false otherwise
   */
  public isCredentialError(error: any): boolean {
    return (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    );
  }

  /**
   * Checks if an error is related to a connection timeout
   * @param error - The error to check
   * @returns True if the error is timeout-related, false otherwise
   */
  public isTimeoutError(error: any): boolean {
    return (
      axios.isAxiosError(error) &&
      (error.code === 'ECONNABORTED' || error.message.includes('timeout'))
    );
  }
}
