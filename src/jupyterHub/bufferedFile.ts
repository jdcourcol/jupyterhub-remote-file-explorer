import { JupyterHubConnectionInterface } from './jupyterHubConnection';

/**
 * Represents a buffered file that can be read from and written to.
 * Manages the state of a file between the local buffer and the remote JupyterHub server.
 */
export class BufferedFile {
    private _content: string = '';
    private _dirty: boolean = false;
    private _closed: boolean = false;
    private _serverContent: string = '';
    
    /**
     * Creates a new BufferedFile instance.
     * 
     * @param _path The path of the file on the JupyterHub server.
     * @param _connection The JupyterHub connection to use for server operations.
     */
    constructor(
        private _path: string,
        private _connection: JupyterHubConnectionInterface
    ) {}
    
    /**
     * Gets the path of the file.
     */
    public getPath(): string {
        return this._path;
    }
    
    /**
     * Gets the current content of the file from the buffer.
     */
    public getContent(): string {
        return this._content;
    }
    
    /**
     * Checks if the file has unsaved changes.
     */
    public isDirty(): boolean {
        return this._dirty;
    }
    
    /**
     * Checks if the file is closed.
     */
    public isClosed(): boolean {
        return this._closed;
    }
    
    /**
     * Reads the file content from the server and updates the buffer.
     */
    public async readFromServer(): Promise<void> {
        try {
            this._serverContent = await this._connection.getFileContent(this._path);
            this._content = this._serverContent;
            this._dirty = false;
        } catch (error) {
            // If the file doesn't exist on the server, keep the buffer empty
            console.error(`Error reading file from server: ${error}`);
        }
    }
    
    /**
     * Writes content to the buffer without saving to the server.
     * 
     * @param content The content to write to the buffer.
     */
    public write(content: string): void {
        this._content = content;
        this._dirty = this._content !== this._serverContent;
    }
    
    /**
     * Saves the buffered content to the server.
     */
    public async save(): Promise<void> {
        if (!this._dirty) {
            return;
        }
        
        await this._connection.saveFile(this._path, this._content);
        this._serverContent = this._content;
        this._dirty = false;
    }
    
    /**
     * Reverts any unsaved changes in the buffer to the last saved state.
     */
    public revert(): void {
        this._content = this._serverContent;
        this._dirty = false;
    }
    
    /**
     * Closes the file and releases any resources.
     */
    public close(): void {
        this._closed = true;
        this._content = '';
        this._serverContent = '';
    }
} 