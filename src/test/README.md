# Testing JupyterHub Remote File Explorer

This directory contains tests for the JupyterHub Remote File Explorer extension.

## Test Structure

- `mocks/`: Contains mock implementations of classes used for testing
- `suite/`: Contains test suites for the extension
- `*.test.ts`: Individual test files for components
- `vscode-mock.ts`: Mock implementation of VS Code API for testing
- `setup.js`: Jest setup file

## Running Tests

To run tests:

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode during development
npm run test:watch
```

## Test Coverage

The coverage report will show which parts of the codebase are covered by tests. This helps identify areas that need more testing.

## Writing Tests

When writing new tests:

1. Use the existing patterns for mocking and testing
2. Place tests in the appropriate directory:
   - Component tests in the root test directory
   - Integration tests in the `suite` directory
3. Mock external dependencies using Jest mocks or custom mock implementations
4. Use descriptive test names that clearly indicate what's being tested

## Troubleshooting

- If you encounter "Jest: command not found" errors, make sure you've installed dependencies with `npm install`
- You can run a specific test with `npx jest -t "test name"`
- Check the VS Code output panel for test results and errors
