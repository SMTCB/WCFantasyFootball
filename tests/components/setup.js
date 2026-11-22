// Shared setup for the component tests (vitest.config.js): jest-dom matchers, and
// unmount everything between tests so one test's DOM never leaks into the next.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());
