// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ConnectionManager } from './jupyterHub/connectionManager';
import { JupyterHubFileSystemProvider } from './jupyterHub/jupyterHubFileSystemProvider';
import { JupyterHubTreeDataProvider, FileEntry } from './jupyterHub/jupyterHubExplorer';

// The filesystem scheme for JupyterHub
const JUPYTER_HUB_SCHEME = 'jupyter-hub';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  try {
    // Create the connection manager
    const connectionManager = new ConnectionManager(context);

    // Register the file system provider only when connected
    let fsProviderRegistration: vscode.Disposable | undefined;

    // Create the tree view provider
    let treeDataProvider: JupyterHubTreeDataProvider | undefined;
    let treeView: vscode.TreeView<FileEntry> | undefined;

    // Register commands

    // Connect to JupyterHub server
    const connectCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.connect',
      async () => {
        const connected = await connectionManager.connect();

        if (connected && connectionManager.connection) {
          // Register the file system provider
          if (!fsProviderRegistration) {
            const fsProvider = new JupyterHubFileSystemProvider(connectionManager.connection);
            fsProviderRegistration = vscode.workspace.registerFileSystemProvider(
              JUPYTER_HUB_SCHEME,
              fsProvider,
              { isCaseSensitive: true }
            );
            context.subscriptions.push(fsProviderRegistration);
          }

          // Set up or refresh the tree view
          if (!treeDataProvider && !treeView) {
            treeDataProvider = new JupyterHubTreeDataProvider(connectionManager.connection);

            treeView = vscode.window.createTreeView('jupyterhubExplorer', {
              treeDataProvider,
              showCollapseAll: true,
              canSelectMany: false,
            });

            // Handle selection events for context menus
            treeView.onDidChangeSelection(() => {
              // Selection change handler
            });

            // Handle expanded state
            treeView.onDidExpandElement(() => {
              // Expansion handler
            });

            // Handle collapse state
            treeView.onDidCollapseElement(() => {
              // Collapse handler
            });

            context.subscriptions.push(treeView);
          } else if (treeDataProvider) {
            treeDataProvider.refresh();
          }

          // Show the explorer view
          vscode.commands.executeCommand('jupyterhubExplorer.focus');
        }
      }
    );

    // Show connection status
    const showConnectionStatusCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.showConnectionStatus',
      () => {
        connectionManager.showConnectionStatus();
      }
    );

    // Update credentials (used when credentials become invalid/expired)
    const updateCredentialsCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.updateCredentials',
      async () => {
        // First disconnect
        connectionManager.disconnect();

        // Clear out any stored credentials
        await connectionManager.forgetCredentials();

        // Show notification to user
        const action = await vscode.window.showInformationMessage(
          'Your JupyterHub credentials have expired or become invalid. Would you like to reconnect with new credentials?',
          'Reconnect',
          'Cancel'
        );

        if (action === 'Reconnect') {
          // Prompt for new credentials
          vscode.commands.executeCommand('jupyterhub-remote-file-explorer.connect');
        }
      }
    );

    // Manage saved connections
    const manageConnectionsCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.manageConnections',
      async () => {
        await connectionManager.manageConnections();
      }
    );

    // Disconnect from JupyterHub server
    const disconnectCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.disconnect',
      () => {
        connectionManager.disconnect();

        // Dispose of the file system provider registration
        if (fsProviderRegistration) {
          fsProviderRegistration.dispose();
          fsProviderRegistration = undefined;
        }

        // Refresh the tree view to show empty state
        if (treeDataProvider) {
          treeDataProvider.refresh();
        }
      }
    );

    // Refresh the explorer view
    const refreshCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.refresh',
      () => {
        if (treeDataProvider) {
          treeDataProvider.refresh();
        }
      }
    );

    // Forget credentials
    const forgetCredentialsCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.forgetCredentials',
      async () => {
        await connectionManager.forgetCredentials();
      }
    );

    // Create a new file on the server
    const createFileCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.createFile',
      async (node?: FileEntry) => {
        if (!connectionManager.isConnected()) {
          vscode.window.showWarningMessage('Please connect to a JupyterHub server first');
          return;
        }

        const basePath = node && node.type === 'directory' ? node.path : '/';

        const fileName = await vscode.window.showInputBox({
          prompt: 'Enter file name',
          placeHolder: 'filename.txt',
          ignoreFocusOut: true,
        });

        if (!fileName) {
          return; // User cancelled
        }

        try {
          const filePath = `${basePath}/${fileName}`.replace(/\/+/g, '/');
          await connectionManager.connection?.createItem(filePath, 'file', '');

          // Refresh the explorer
          if (treeDataProvider) {
            treeDataProvider.refresh();
          }

          // Show temporary success notification that auto-dismisses
          vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `File created successfully: ${filePath}`,
              cancellable: false,
            },
            async progress => {
              // Auto-dismiss after 2 seconds
              await new Promise(resolve => setTimeout(resolve, 2000));
              return;
            }
          );
        } catch (error: unknown) {
          vscode.window.showErrorMessage(
            `Failed to create file: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Create a new directory on the server
    const createDirectoryCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.createDirectory',
      async (node?: FileEntry) => {
        if (!connectionManager.isConnected()) {
          vscode.window.showWarningMessage('Please connect to a JupyterHub server first');
          return;
        }

        const basePath = node && node.type === 'directory' ? node.path : '/';

        const dirName = await vscode.window.showInputBox({
          prompt: 'Enter directory name',
          placeHolder: 'newdirectory',
          ignoreFocusOut: true,
        });

        if (!dirName) {
          return; // User cancelled
        }

        try {
          const dirPath = `${basePath}/${dirName}`.replace(/\/+/g, '/');
          await connectionManager.connection?.createItem(dirPath, 'directory');

          // Refresh the explorer with a small delay to ensure server has updated
          setTimeout(() => {
            if (treeDataProvider) {
              treeDataProvider.refresh();
            }
          }, 500);

          // Show temporary success notification that auto-dismisses
          vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Directory created successfully: ${dirPath}`,
              cancellable: false,
            },
            async progress => {
              // Auto-dismiss after 2 seconds
              await new Promise(resolve => setTimeout(resolve, 2000));
              return;
            }
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Delete a file or directory
    const deleteItemCommand = vscode.commands.registerCommand(
      'jupyterhub-remote-file-explorer.deleteItem',
      async (node?: FileEntry) => {
        if (!connectionManager.isConnected() || !node) {
          vscode.window.showWarningMessage(
            'Please connect to a JupyterHub server and select an item to delete'
          );
          return;
        }

        const confirmed = await vscode.window.showWarningMessage(
          `Are you sure you want to delete ${node.name}?`,
          { modal: true },
          'Delete'
        );

        if (confirmed !== 'Delete') {
          return; // User cancelled
        }

        try {
          await connectionManager.connection?.deleteItem(node.path);

          // Refresh the explorer
          if (treeDataProvider) {
            treeDataProvider.refresh();
          }

          // Show temporary success notification that auto-dismisses
          vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Successfully deleted: ${node.name}`,
              cancellable: false,
            },
            async progress => {
              // Auto-dismiss after 2 seconds
              await new Promise(resolve => setTimeout(resolve, 2000));
              return;
            }
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to delete ${node.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Register all commands
    context.subscriptions.push(
      connectCommand,
      disconnectCommand,
      refreshCommand,
      forgetCredentialsCommand,
      createFileCommand,
      createDirectoryCommand,
      deleteItemCommand,
      updateCredentialsCommand,
      showConnectionStatusCommand,
      manageConnectionsCommand
    );

    // Try to connect automatically if configured
    const autoConnect = vscode.workspace
      .getConfiguration('jupyterhub')
      .get<boolean>('autoConnect', false);
    if (autoConnect) {
      vscode.commands.executeCommand('jupyterhub-remote-file-explorer.connect');
    }
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(`JupyterHub Explorer failed to activate: ${error.message}`);
    } else {
      vscode.window.showErrorMessage(`JupyterHub Explorer failed to activate: ${String(error)}`);
    }
    throw error; // Rethrow so VS Code can log it properly
  }
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Clean up resources when the extension is deactivated
}
