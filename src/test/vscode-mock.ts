/**
 * Mock implementation of the VS Code API for testing.
 * This file provides mock implementations of the VS Code API components
 * used by the extension.
 */

// Tree view related
export const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2
};

export class TreeItem {
    constructor(public label: string, public collapsibleState: number = TreeItemCollapsibleState.None) {
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.iconPath = undefined;
        this.contextValue = undefined;
        this.description = undefined;
        this.tooltip = undefined;
        this.command = undefined;
    }
    
    iconPath: any;
    contextValue: string | undefined;
    description: string | undefined;
    tooltip: string | undefined;
    command: { command: string; title: string; arguments?: any[] } | undefined;
}

// Event handling
export class EventEmitter<T> {
    private handlers: ((e: T) => any)[] = [];
    
    get event(): (listener: (e: T) => any) => Disposable {
        return (listener: (e: T) => any): Disposable => {
            this.handlers.push(listener);
            return {
                dispose: () => {
                    this.handlers = this.handlers.filter(l => l !== listener);
                }
            };
        };
    }
    
    fire(data: T): void {
        this.handlers.forEach(handler => handler(data));
    }
}

// UI components
export const window = {
    createTreeView: jest.fn().mockImplementation(() => ({
        onDidChangeSelection: jest.fn(),
        onDidExpandElement: jest.fn(),
        onDidCollapseElement: jest.fn(),
        reveal: jest.fn()
    })),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn().mockImplementation((message) => {
        console.error(message);
        return Promise.resolve(undefined);
    }),
    setStatusBarMessage: jest.fn().mockImplementation(() => ({ dispose: jest.fn() })),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    withProgress: jest.fn().mockImplementation((options, task) => task({
        report: jest.fn()
    }))
};

// File system handling
export const workspace = {
    registerFileSystemProvider: jest.fn(),
    openTextDocument: jest.fn().mockImplementation(() => Promise.resolve()),
    getConfiguration: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
        update: jest.fn()
    }))
};

// Commands
export const commands = {
    registerCommand: jest.fn(),
    executeCommand: jest.fn()
};

// Extension context
export class ExtensionContext {
    subscriptions: Disposable[] = [];
    workspaceState = new Memento();
    globalState = new Memento();
    extensionPath = '/test/extension/path';
    globalStorageUri = { fsPath: '/test/global/storage' };
    storagePath = '/test/storage';
    logPath = '/test/logs';
    
    asAbsolutePath(relativePath: string): string {
        return `/test/extension/path/${relativePath}`;
    }
}

// Memento for state storage
class Memento {
    private storage = new Map<string, any>();
    
    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.storage.has(key) ? this.storage.get(key) : defaultValue;
    }
    
    update(key: string, value: any): Thenable<void> {
        this.storage.set(key, value);
        return Promise.resolve();
    }
}

// URI handling
export class Uri {
    static file(path: string): Uri {
        return new Uri(path, 'file');
    }
    
    static parse(uri: string): Uri {
        const scheme = uri.split(':')[0];
        const path = uri.substring(scheme.length + 1);
        return new Uri(path, scheme);
    }
    
    constructor(public path: string, public scheme: string) {
        this.path = path;
        this.scheme = scheme;
    }
    
    with(change: { scheme?: string; path?: string }): Uri {
        return new Uri(
            change.path !== undefined ? change.path : this.path,
            change.scheme !== undefined ? change.scheme : this.scheme
        );
    }
    
    toString(): string {
        return `${this.scheme}:${this.path}`;
    }
}

// Disposable interface
export interface Disposable {
    dispose(): void;
}

// Create a disposable
export function Disposable(func: () => void): Disposable {
    return { dispose: func };
}

// File system provider interfaces
export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64
}

export interface FileStat {
    type: FileType;
    ctime: number;
    mtime: number;
    size: number;
}

export enum FileChangeType {
    Changed = 1,
    Created = 2,
    Deleted = 3
}

export interface FileChangeEvent {
    type: FileChangeType;
    uri: Uri;
}

// File system errors
export class FileSystemError extends Error {
    readonly code: string;
    
    constructor(code: string, message?: string) {
        super(message || code);
        this.code = code;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, FileSystemError.prototype);
    }
    
    static FileNotFound(messageOrUri?: string | Uri): FileSystemError {
        return new FileSystemError('FileNotFound', messageOrUri?.toString() || 'File not found');
    }
    
    static FileExists(messageOrUri?: string | Uri): FileSystemError {
        return new FileSystemError('FileExists', messageOrUri?.toString() || 'File exists');
    }
    
    static FileNotADirectory(messageOrUri?: string | Uri): FileSystemError {
        return new FileSystemError('FileNotADirectory', messageOrUri?.toString() || 'File is not a directory');
    }
    
    static FileIsADirectory(messageOrUri?: string | Uri): FileSystemError {
        return new FileSystemError('FileIsADirectory', messageOrUri?.toString() || 'File is a directory');
    }
    
    static NoPermissions(messageOrUri?: string | Uri): FileSystemError {
        return new FileSystemError('NoPermissions', messageOrUri?.toString() || 'No permissions');
    }
    
    static Unavailable(messageOrUri?: string | Uri): FileSystemError {
        return new FileSystemError('Unavailable', messageOrUri?.toString() || 'Resource unavailable');
    }
}

// Theme icons
export class ThemeIcon {
    constructor(public id: string) {
        this.id = id;
    }
}

// Progress
export enum ProgressLocation {
    Window = 10,
    Notification = 15
}

// Other exports
export const ViewColumn = {
    Active: -1,
    Beside: -2,
    One: 1,
    Two: 2,
    Three: 3
}; 