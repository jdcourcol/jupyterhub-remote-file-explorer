import * as vscode from 'vscode';
import { JupyterHubConnection, JupyterHubConnectionOptions } from './jupyterHubConnection';

/**
 * Connection profile interface
 */
export interface ConnectionProfile {
  id: string;
  name: string;
  serverUrl: string;
  token: string;
  username?: string;
}

/**
 * Connection manager for JupyterHub connections
 */
export class ConnectionManager {
  private static readonly CONNECTIONS_KEY = 'jupyterhub.connections';
  private static readonly LAST_CONNECTION_ID = 'jupyterhub.lastConnectionId';
  private _connection: JupyterHubConnection | undefined;
  private _statusBarItem: vscode.StatusBarItem;

  constructor(private context: vscode.ExtensionContext) {
    // Create a status bar item to show connection status
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this._statusBarItem.command = 'jupyterhub-remote-file-explorer.showConnectionStatus';
    context.subscriptions.push(this._statusBarItem);

    // Update the status initially
    this.updateStatusBar();
  }

  /**
   * Get the current connection
   */
  public get connection(): JupyterHubConnection | undefined {
    return this._connection;
  }

  /**
   * Check if we're connected to a JupyterHub server
   */
  public isConnected(): boolean {
    return this._connection !== undefined && this._connection.isActive();
  }

  /**
   * Get the connection info
   */
  public getConnectionInfo(): { serverUrl: string; username?: string } | undefined {
    if (!this._connection) {
      return undefined;
    }

    return this._connection.getServerInfo();
  }

  /**
   * Get all saved connection profiles
   */
  private getSavedConnections(): ConnectionProfile[] {
    return this.context.globalState.get<ConnectionProfile[]>(ConnectionManager.CONNECTIONS_KEY, []);
  }

  /**
   * Save a connection profile
   */
  private async saveConnection(profile: ConnectionProfile): Promise<void> {
    const connections = this.getSavedConnections();

    // Check if this profile already exists
    const existingIndex = connections.findIndex(p => p.id === profile.id);
    if (existingIndex >= 0) {
      // Update existing profile
      connections[existingIndex] = profile;
    } else {
      // Add new profile
      connections.push(profile);
    }

    await this.context.globalState.update(ConnectionManager.CONNECTIONS_KEY, connections);
    await this.context.globalState.update(ConnectionManager.LAST_CONNECTION_ID, profile.id);
  }

  /**
   * Delete a connection profile
   */
  private async deleteConnection(id: string): Promise<void> {
    const connections = this.getSavedConnections().filter(p => p.id !== id);
    await this.context.globalState.update(ConnectionManager.CONNECTIONS_KEY, connections);

    // Clear last connection if it was the one deleted
    const lastId = this.context.globalState.get<string>(ConnectionManager.LAST_CONNECTION_ID);
    if (lastId === id) {
      await this.context.globalState.update(ConnectionManager.LAST_CONNECTION_ID, undefined);
    }
  }

  /**
   * Get last used connection
   */
  private getLastConnection(): ConnectionProfile | undefined {
    const lastId = this.context.globalState.get<string>(ConnectionManager.LAST_CONNECTION_ID);
    if (!lastId) {
      return undefined;
    }

    const connections = this.getSavedConnections();
    return connections.find(p => p.id === lastId);
  }

  /**
   * Connect to JupyterHub server
   */
  public async connect(): Promise<boolean> {
    // Get list of saved connections
    const connections = this.getSavedConnections();
    const lastConnection = this.getLastConnection();

    let serverUrl: string | undefined;
    let token: string | undefined;
    let connectionName: string | undefined;

    // If we have saved connections, offer a quick pick to select one
    if (connections.length > 0) {
      const quickPickItems: Array<vscode.QuickPickItem & { profile?: ConnectionProfile }> =
        connections.map(profile => ({
          label: profile.name,
          description: profile.serverUrl,
          detail: `Username: ${profile.username || 'Not set'}`,
          profile: profile,
        }));

      // Add option for new connection
      quickPickItems.push({
        label: '$(add) New connection...',
        description: 'Create a new connection profile',
      });

      // Set the default selected item to the last used connection
      let activeItem: vscode.QuickPickItem | undefined;
      if (lastConnection) {
        activeItem = quickPickItems.find(
          item => item.profile && item.profile.id === lastConnection.id
        );
      }

      const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a JupyterHub server to connect to',
        ignoreFocusOut: true,
      });

      if (!selectedItem) {
        return false; // User cancelled
      }

      if (selectedItem.profile) {
        // Use existing profile
        serverUrl = selectedItem.profile.serverUrl;
        token = selectedItem.profile.token;
        connectionName = selectedItem.profile.name;
      }
    }

    // If user selected "New connection" or no saved connections, prompt for details
    if (!serverUrl || !token) {
      connectionName = await vscode.window.showInputBox({
        prompt: 'Enter a name for this connection',
        placeHolder: 'My JupyterHub Server',
        ignoreFocusOut: true,
      });

      if (!connectionName) {
        return false; // User cancelled
      }

      serverUrl = await vscode.window.showInputBox({
        prompt: 'Enter JupyterHub server URL',
        placeHolder: 'https://your-jupyterhub-server.com',
        ignoreFocusOut: true,
      });

      if (!serverUrl) {
        return false; // User cancelled
      }

      token = await vscode.window.showInputBox({
        prompt: 'Enter JupyterHub API token',
        password: true,
        ignoreFocusOut: true,
      });

      if (!token) {
        return false; // User cancelled
      }

      // Ask if we should save this connection
      const remember = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Save this connection for future use?',
        ignoreFocusOut: true,
      });

      if (remember === 'Yes') {
        try {
          // Generate a unique ID for this connection
          const id = `connection-${Date.now()}`;

          // Save the connection profile
          const profile: ConnectionProfile = {
            id,
            name: connectionName,
            serverUrl,
            token,
          };

          await this.saveConnection(profile);
        } catch (error) {
          console.error('Error saving connection:', error);
        }
      }
    }

    // Create a new connection
    const options: JupyterHubConnectionOptions = {
      serverUrl,
      token,
    };

    this._connection = new JupyterHubConnection(options);

    // Try to connect
    const connected = await this._connection.connect();

    if (connected) {
      // Show notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Connected to JupyterHub server: ${serverUrl}`,
          cancellable: false,
        },
        async () => {
          // Auto-dismiss after 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));
          return;
        }
      );

      // If we have a new username from the connection, update the profile
      if (this._connection.getServerInfo().username) {
        const lastConnection = this.getLastConnection();
        if (lastConnection) {
          lastConnection.username = this._connection.getServerInfo().username;
          await this.saveConnection(lastConnection);
        }
      }

      // Update status bar after connection attempt
      this.updateStatusBar();
    } else {
      this._connection = undefined;
      vscode.window.showErrorMessage(`Failed to connect to JupyterHub server: ${serverUrl}`);

      // Update status bar
      this.updateStatusBar();
    }

    return connected;
  }

  /**
   * Disconnect from JupyterHub server
   */
  public disconnect(): void {
    if (this._connection) {
      this._connection.disconnect();
      this._connection = undefined;
      // Show notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Disconnected from JupyterHub server',
          cancellable: false,
        },
        async () => {
          // Auto-dismiss after 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));
          return;
        }
      );

      // Update status bar
      this.updateStatusBar();
    }
  }

  /**
   * Forget the stored credentials
   */
  public async forgetCredentials(): Promise<void> {
    try {
      // Get the current connection info to determine which one to forget
      const info = this.getConnectionInfo();
      if (info && info.serverUrl) {
        const connections = this.getSavedConnections();
        const toDelete = connections.find(c => c.serverUrl === info.serverUrl);

        if (toDelete) {
          await this.deleteConnection(toDelete.id);
        }
      } else {
        // If not connected, let user choose which connection to forget
        await this.manageConnections();
      }

      // Show notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'JupyterHub credentials have been removed',
          cancellable: false,
        },
        async () => {
          // Auto-dismiss after 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));
          return;
        }
      );
    } catch (error) {
      console.error('Error removing credentials:', error);
      vscode.window.showErrorMessage(
        `Failed to remove credentials: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Manage saved connections
   */
  public async manageConnections(): Promise<void> {
    const connections = this.getSavedConnections();

    if (connections.length === 0) {
      // No connections found, just return silently
      return;
    }

    const quickPickItems = connections.map(profile => ({
      label: profile.name,
      description: profile.serverUrl,
      profile,
    }));

    const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: 'Select a connection to manage',
      ignoreFocusOut: true,
    });

    if (!selectedItem) {
      return; // User cancelled
    }

    const action = await vscode.window.showQuickPick(
      [
        { label: 'Connect', description: 'Connect to this server' },
        { label: 'Forget', description: 'Delete this connection' },
      ],
      {
        placeHolder: `Manage connection: ${selectedItem.label}`,
        ignoreFocusOut: true,
      }
    );

    if (!action) {
      return; // User cancelled
    }

    if (action.label === 'Connect') {
      // Use the selected connection
      const options: JupyterHubConnectionOptions = {
        serverUrl: selectedItem.profile.serverUrl,
        token: selectedItem.profile.token,
        username: selectedItem.profile.username,
      };

      this._connection = new JupyterHubConnection(options);
      await this._connection.connect();

      // Update the last used connection
      await this.context.globalState.update(
        ConnectionManager.LAST_CONNECTION_ID,
        selectedItem.profile.id
      );

      // Update status bar
      this.updateStatusBar();

      // Refresh the explorer
      vscode.commands.executeCommand('jupyterhub-remote-file-explorer.refresh');
    } else if (action.label === 'Forget') {
      // Delete the connection
      await this.deleteConnection(selectedItem.profile.id);
      // Show notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Connection '${selectedItem.label}' has been removed.`,
          cancellable: false,
        },
        async () => {
          // Auto-dismiss after 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));
          return;
        }
      );
    }
  }

  /**
   * Update the status bar item to show current connection status
   */
  private updateStatusBar(): void {
    if (this.isConnected()) {
      const info = this.getConnectionInfo();
      this._statusBarItem.text = `$(link) JupyterHub: ${info?.username || 'Connected'}`;
      this._statusBarItem.tooltip = `Connected to ${info?.serverUrl}`;
      this._statusBarItem.show();
    } else {
      this._statusBarItem.text = '$(link-external) JupyterHub: Disconnected';
      this._statusBarItem.tooltip = 'Click to connect to JupyterHub';
      this._statusBarItem.command = 'jupyterhub-remote-file-explorer.connect';
      this._statusBarItem.show();
    }
  }

  /**
   * Show connection status in a notification
   */
  public showConnectionStatus(): void {
    if (this.isConnected()) {
      const info = this.getConnectionInfo();
      // Show temporary notification with connection info
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Connected to JupyterHub server: ${info?.serverUrl} (${info?.username})`,
          cancellable: false,
        },
        async () => {
          // Auto-dismiss after 3 seconds
          await new Promise(resolve => setTimeout(resolve, 3000));
          return;
        }
      );
    } else {
      // Show temporary notification about disconnected state
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Not connected to any JupyterHub server',
          cancellable: false,
        },
        async () => {
          // Auto-dismiss after 3 seconds
          await new Promise(resolve => setTimeout(resolve, 3000));
          return;
        }
      );
    }
  }
}
