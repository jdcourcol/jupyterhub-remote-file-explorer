/**
 * Global type declarations for Jest
 */

// Add Jest globals to avoid TypeScript errors
declare namespace jest {
    function fn<T extends (...args: any[]) => any>(implementation?: T): jest.Mock<ReturnType<T>, Parameters<T>>;
    function mock(moduleName: string, factory?: any, options?: any): void;
    function spyOn<T, K extends keyof T>(object: T, method: K): jest.SpyInstance<T[K], T>;
    function clearAllMocks(): void;
    
    interface SpyInstance<T = any, Y extends any[] = any[]> {
        mockClear(): this;
        mockReset(): this;
        mockRestore(): void;
        mockImplementation(fn: (...args: Y) => T): this;
        mockImplementationOnce(fn: (...args: Y) => T): this;
        mockReturnValue(value: T): this;
        mockReturnValueOnce(value: T): this;
        mockResolvedValue(value: T): this;
        mockResolvedValueOnce(value: T): this;
        mockRejectedValue(value: any): this;
        mockRejectedValueOnce(value: any): this;
    }
    
    interface Mock<T = any, Y extends any[] = any[]> {
        (...args: Y): T;
        mock: {
            calls: Y[];
            instances: any[];
            invocationCallOrder: number[];
            results: Array<{ type: string; value: any }>;
        };
        mockClear(): this;
        mockReset(): this;
        mockRestore(): void;
        mockImplementation(fn: (...args: Y) => T): this;
        mockImplementationOnce(fn: (...args: Y) => T): this;
        mockReturnValue(value: T): this;
        mockReturnValueOnce(value: T): this;
        mockResolvedValue(value: T): this;
        mockResolvedValueOnce(value: T): this;
        mockRejectedValue(value: any): this;
        mockRejectedValueOnce(value: any): this;
    }
    
    interface Matchers<R> {
        not: Matchers<R>;
        toBe(expected: any): R;
        toEqual(expected: any): R;
        toBeInstanceOf(expected: any): R;
        toContain(expected: any): R;
        toHaveBeenCalled(): R;
        toHaveBeenCalledTimes(expected: number): R;
        toHaveBeenCalledWith(...args: any[]): R;
        toHaveBeenLastCalledWith(...args: any[]): R;
        toBeUndefined(): R;
        toBeNull(): R;
        toBeTruthy(): R;
        toBeFalsy(): R;
        toBeCloseTo(expected: number, precision?: number): R;
        toHaveProperty(keyPath: string | string[], value?: any): R;
        toBeDefined(): R;
        toMatchObject(expected: object | object[]): R;
        toMatch(expected: string | RegExp): R;
        toThrow(error?: string | Error | RegExp): R;
        toThrowError(error?: string | Error | RegExp): R;
        rejects: PromiseMatchers<R>;
        resolves: PromiseMatchers<R>;
    }
    
    interface PromiseMatchers<R> {
        toBe(expected: any): Promise<R>;
        toEqual(expected: any): Promise<R>;
        toBeInstanceOf(expected: any): Promise<R>;
        toContain(expected: any): Promise<R>;
        toHaveBeenCalled(): Promise<R>;
        toHaveBeenCalledTimes(expected: number): Promise<R>;
        toHaveBeenCalledWith(...args: any[]): Promise<R>;
        toHaveBeenLastCalledWith(...args: any[]): Promise<R>;
        toBeUndefined(): Promise<R>;
        toBeNull(): Promise<R>;
        toBeTruthy(): Promise<R>;
        toBeFalsy(): Promise<R>;
        toBeCloseTo(expected: number, precision?: number): Promise<R>;
        toHaveProperty(keyPath: string | string[], value?: any): Promise<R>;
        toBeDefined(): Promise<R>;
        toMatchObject(expected: object | object[]): Promise<R>;
        toMatch(expected: string | RegExp): Promise<R>;
        toThrow(error?: string | Error | RegExp): Promise<R>;
        toThrowError(error?: string | Error | RegExp): Promise<R>;
    }

    // Add utilities for expect
    function objectContaining<T>(obj: T): T;
}

// Define global expect function
declare const expect: <T>(actual: T) => jest.Matchers<T>;
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const afterEach: (fn: () => void | Promise<void>) => void;
declare const beforeAll: (fn: () => void | Promise<void>) => void;
declare const afterAll: (fn: () => void | Promise<void>) => void;

// Add missing type for Mocked
declare namespace jest {
    type Mocked<T> = {
        [P in keyof T]: T[P] extends (...args: any[]) => any
            ? jest.Mock<ReturnType<T[P]>, Parameters<T[P]>>
            : T[P];
    } & T;
} 