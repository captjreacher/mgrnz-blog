import { promises as fs } from 'fs';
import path from 'path';

// Setup test environment
const testDataDir = './test-data';

// Clean up test data directory before each test run
export async function setup() {
  try {
    await fs.rm(testDataDir, { recursive: true, force: true });
    await fs.mkdir(testDataDir, { recursive: true });
  } catch (error) {
    console.warn('Setup warning:', error.message);
  }
}

// Clean up after tests
export async function teardown() {
  try {
    await fs.rm(testDataDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('Teardown warning:', error.message);
  }
}

// Run setup before tests
await setup();