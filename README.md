# JupyterHub Remote File Explorer

A Visual Studio Code extension that replicates PyCharm's functionality for interacting with a remote JupyterHub file system directly from your editor.

## Features

- Connect to a remote JupyterHub server using credentials
- Save and manage multiple JupyterHub server connections
- Display remote files and folders in a tree view
- Open and edit remote files directly in VS Code
- Create, rename, and delete files and folders
- Secure credential storage

## How to Use

### Getting Your JupyterHub API Token

To use this extension, you'll need an API token from your JupyterHub server:

1. Log in to your JupyterHub instance in a web browser
2. Go to the Hub Control Panel (usually at `/hub/home` or by clicking on "Control Panel")
3. Click on "Token" in the sidebar (or visit `/hub/token`)
4. Generate a new API token
5. Copy the token for use with the extension

### Connecting to JupyterHub

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on macOS)
2. Type "JupyterHub: Connect" and select the command
3. You'll see a dropdown list of your saved connections, or you can create a new one
4. For new connections:
   - Enter a name for the connection
   - Enter your JupyterHub server URL (e.g., `https://your-jupyterhub-server.com`)
   - Enter your API token
   - Choose whether to save this connection for future use

The extension saves your connections so you can quickly select them from a dropdown when connecting, without needing to re-enter credentials each time.

### Managing Saved Connections

You can manage your saved connections:

1. Open the Command Palette
2. Type "JupyterHub: Manage Saved Connections"
3. Select a connection from the list
4. Choose to connect to it or forget (delete) it

### Credential Management

JupyterHub tokens can expire or become invalid over time. This extension will:

- Automatically detect when credentials become invalid
- Prompt you to update your credentials when needed
- Provide status information about your connection in the status bar

To manually update your credentials:

- Click on the JupyterHub status indicator in the status bar
- Select "Update Credentials" from the menu
- Or use the "JupyterHub: Update Credentials" command from the Command Palette

### Working with Remote Files

Once connected:

1. The JupyterHub Explorer view will appear in the Explorer sidebar
2. Browse the remote file system by expanding directories
3. Click on a file to open it in the editor
4. Edit files as you would with local files
5. Save changes to update the remote file

### File Operations

- **Creating files/folders**:
  - Click the "New File" or "New Folder" buttons in the explorer view
  - Right-click on a folder and select "New File" or "New Folder"
  
- **Deleting items**:
  - Right-click on an item and select "Delete"
  
- **Refreshing the view**:
  - Click the "Refresh" button in the explorer view

## Requirements

- VS Code 1.99.0 or higher
- A running JupyterHub server with accessible API
- Valid JupyterHub credentials with an API token

## Extension Settings

This extension contributes the following settings:

- `jupyterhub.autoConnect`: Enable/disable automatic connection to the last used JupyterHub server on startup (disabled by default)
- `jupyterhub.connectionTimeout`: Timeout in milliseconds for JupyterHub server connections (default: 10000)
- `jupyterhub.allowSelfSignedCertificates`: Allow connections to servers with self-signed or invalid SSL certificates (disabled by default)

## Known Limitations

- Watch functionality for real-time updates is limited by JupyterHub API

## Release Notes

### 1.0.4

Initial release with:

- Connection to JupyterHub servers
- File system explorer
- Basic file operations (create, edit, delete)
- Support for self-signed certificates

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the [MIT License](LICENSE.md).
