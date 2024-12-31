import { defineWorkspace } from 'vitest/config';

const single_thread_files = [
  'test/integration_test.ts',
  'test/http/integration_test.ts'
];

export default defineWorkspace([
  {
    extends: './vite.config.ts',
    test: {
      name: 'firefox',
      exclude: [ ...single_thread_files, 'node_modules/**' ],
      include: ["test/**/*_{test,spec}.?(c|m)[jt]s?(x)"],
      browser: {
        enabled: true,
        name: 'firefox',
        provider: 'playwright',
        headless: true
      },
      poolOptions: {
        forks: {
          singleFork: true
        }
      }
    }
  }
])
