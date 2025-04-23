// Setup file for Jest tests

// Set timeout to 10 seconds for all tests
jest.setTimeout(10000);

// Mock console methods to avoid cluttering test output
global.console = {
  ...console,
  // Keep error output for debugging
  error: jest.fn(),
  // Silence other console output during tests
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

// Mock process.exit to prevent tests from exiting
process.exit = jest.fn();

// Define VS Code-style test functions
global.suite = describe;
global.test = it;
global.setup = beforeEach;
global.teardown = afterEach;
global.suiteSetup = beforeAll;
global.suiteTeardown = afterAll;

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});