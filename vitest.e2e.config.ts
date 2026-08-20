import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
    test: {
        globals: true,
        include: ['test/e2e/**/*.e2e.ts'],
        // No setupFiles — real I/O, no mocks
        testTimeout: 30_000,
        hookTimeout: 60_000,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
});
