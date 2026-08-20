/**
 * Unit tests for the findByVision plugin command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCreate, mockFetch } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
    mockFetch: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
    })),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('../src/util', () => ({
    getPngDimensions: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
}));

const ONE_MARK = [{ x1: 495, y1: 295, x2: 505, y2: 305 }];

vi.mock('../src/vision/mark-detect', () => ({
    detectMarks: vi.fn().mockImplementation(async () =>
        ONE_MARK.map((b, i) => ({
            id: i + 1,
            x: Math.round((b.x1 + b.x2) / 2),
            y: Math.round((b.y1 + b.y2) / 2),
            ...b,
        }))
    ),
}));

vi.mock('../src/vision/annotate', () => ({
    annotateMarksOnImage: vi.fn().mockResolvedValue(Buffer.from('fake-annotated-png')),
}));

import { findByVision } from '../src/find-by-vision';
import { detectMarks } from '../src/vision/mark-detect';

const FAKE_SCREENSHOT = 'fake-base64-png';

/** Mocks the driver's `executeMethod` dispatch for the two commands buildCoordMapping calls. */
function makeMockDriver(overrides: {
    getWindowRect?: object;
    monitors?: object[];
    dpiScale?: number;
} = {}) {
    const monitors = overrides.monitors ?? [{ primary: true, bounds: { width: 1920, height: 1080 } }];
    const dpiScale = overrides.dpiScale ?? 1.0;
    return {
        getScreenshot: vi.fn().mockResolvedValue(FAKE_SCREENSHOT),
        getWindowRect: vi.fn().mockResolvedValue(
            overrides.getWindowRect ?? { x: 100, y: 200, width: 1920, height: 1080 }
        ),
        executeMethod: vi.fn().mockImplementation(async (script: string) => {
            if (script === 'windows: getMonitors') { return monitors; }
            if (script === 'windows: getDpiScale') { return dpiScale; }
            throw new Error(`Unexpected executeMethod call: ${script}`);
        }),
    };
}

function makeLLMResponse(tag: number, label: string) {
    return {
        content: [{ type: 'text', text: JSON.stringify({ tag, label }) }],
    };
}

function setMarks(boxes: Array<{ x1: number; y1: number; x2: number; y2: number }>) {
    vi.mocked(detectMarks).mockResolvedValue(
        boxes.map((b, i) => ({
            id: i + 1,
            x: Math.round((b.x1 + b.x2) / 2),
            y: Math.round((b.y1 + b.y2) / 2),
            ...b,
        }))
    );
}

/** Calls findByVision the way BasePlugin's executeMethod dispatch would. */
function callFindByVision(
    driver: ReturnType<typeof makeMockDriver>,
    prompt: string,
    model?: string,
    includeAnnotatedImage?: boolean,
) {
    const next = vi.fn();
    const pluginThis = { log: { info: vi.fn() } };
    return findByVision.call(pluginThis, next, driver as any, prompt, model as any, includeAnnotatedImage);
}

describe('findByVision', () => {
    const savedEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = 'test-key';
        setMarks(ONE_MARK);
    });

    afterEach(() => {
        process.env = { ...savedEnv };
    });

    it('throws when model argument is missing', async () => {
        const driver = makeMockDriver();

        await expect(
            callFindByVision(driver, 'OK button')
        ).rejects.toThrow('requires a "model" argument');
    });

    it('throws when ANTHROPIC_API_KEY is not set', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const driver = makeMockDriver();

        await expect(
            callFindByVision(driver, 'OK button', 'claude-opus-4-6')
        ).rejects.toThrow('ANTHROPIC_API_KEY');
    });

    it('throws when AWS_SECRET_ACCESS_KEY is not set for Bedrock model', async () => {
        process.env.AWS_ACCESS_KEY_ID = 'fake-key';
        delete process.env.AWS_SECRET_ACCESS_KEY;
        const driver = makeMockDriver();

        await expect(
            callFindByVision(driver, 'OK button', 'amazon.nova-pro-v1:0')
        ).rejects.toThrow('AWS_SECRET_ACCESS_KEY');
    });

    it('throws when OPENAI_API_KEY is not set for GPT model', async () => {
        delete process.env.OPENAI_API_KEY;
        const driver = makeMockDriver();

        await expect(
            callFindByVision(driver, 'OK button', 'gpt-4o')
        ).rejects.toThrow('OPENAI_API_KEY');
    });

    it('throws when GEMINI_API_KEY is not set for Gemini model', async () => {
        delete process.env.GEMINI_API_KEY;
        const driver = makeMockDriver();

        await expect(
            callFindByVision(driver, 'OK button', 'gemini-2.0-flash')
        ).rejects.toThrow('GEMINI_API_KEY');
    });

    it('returns screen coordinates for app session at 100% DPI', async () => {
        // Mark center is (500, 300). At 100% DPI: scaleX = 1920/1920 = 1.0, offset = (100, 200)
        // actual_x = 100 + 500 * 1.0 = 600, actual_y = 200 + 300 * 1.0 = 500
        const driver = makeMockDriver({
            getWindowRect: { x: 100, y: 200, width: 1920, height: 1080 },
        });
        mockCreate.mockResolvedValue(makeLLMResponse(1, 'OK button'));

        const result = await callFindByVision(driver, 'OK button', 'claude-opus-4-6');

        expect(result.x).toBe(600);
        expect(result.y).toBe(500);
        expect(result.label).toBe('OK button');
    });

    it('returns screen coordinates for root/desktop session', async () => {
        setMarks([{ x1: 955, y1: 535, x2: 965, y2: 545 }]);
        const driver = makeMockDriver({
            getWindowRect: { x: 0, y: 0, width: 2147483647, height: 2147483647 },
            monitors: [{ primary: true, bounds: { width: 1920, height: 1080 } }],
        });
        mockCreate.mockResolvedValue(makeLLMResponse(1, 'desktop center'));

        const result = await callFindByVision(driver, 'desktop center', 'claude-opus-4-6');

        expect(result.x).toBe(960);
        expect(result.y).toBe(540);
        expect(result.label).toBe('desktop center');
    });

    it('applies DPI scale correction for logical pixel rects', async () => {
        // At 150% DPI: logical rect is 1280×720, physical ssW is 1920×1080
        setMarks([{ x1: 395, y1: 295, x2: 405, y2: 305 }]);
        const driver = makeMockDriver({
            getWindowRect: { x: 0, y: 0, width: 1280, height: 720 },
            dpiScale: 1.5,
        });
        mockCreate.mockResolvedValue(makeLLMResponse(1, 'button'));

        const result = await callFindByVision(driver, 'button', 'claude-opus-4-6');

        expect(result.x).toBe(400);
        expect(result.y).toBe(300);
    });

    it('throws when element is not found (tag === -1)', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue(makeLLMResponse(-1, 'not found'));

        await expect(
            callFindByVision(driver, 'nonexistent element', 'claude-opus-4-6')
        ).rejects.toThrow('Element not found');
    });

    it('throws when LLM returns non-JSON text', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue({
            content: [{ type: 'text', text: 'I cannot see any matching element in this screenshot.' }],
        });

        await expect(
            callFindByVision(driver, 'something', 'claude-opus-4-6')
        ).rejects.toThrow('Unexpected LLM response');
    });

    it('throws when LLM returns an out-of-range tag', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue(makeLLMResponse(7, 'hallucinated'));

        await expect(
            callFindByVision(driver, 'something', 'claude-opus-4-6')
        ).rejects.toThrow('but only 1 marks exist');
    });

    it('throws when no candidate marks are detected', async () => {
        setMarks([]);
        const driver = makeMockDriver();

        await expect(
            callFindByVision(driver, 'something', 'claude-opus-4-6')
        ).rejects.toThrow('no candidate UI elements detected');
    });

    it('surfaces the real error when CV mark detection itself fails, not the generic zero-marks message', async () => {
        vi.mocked(detectMarks).mockRejectedValue(new Error('WASM init failed'));
        const driver = makeMockDriver();

        await expect(
            callFindByVision(driver, 'something', 'claude-opus-4-6')
        ).rejects.toThrow('CV mark detection failed: WASM init failed');
    });

    it('extracts JSON from LLM response that has surrounding text', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue({
            content: [{ type: 'text', text: 'Sure! Here is the result: {"tag":1,"label":"Submit"}' }],
        });

        const result = await callFindByVision(driver, 'Submit button', 'claude-opus-4-6');

        expect(result.x).toBeGreaterThanOrEqual(0);
        expect(result.label).toBe('Submit');
    });

    it('throws when model is not specified', async () => {
        const driver = makeMockDriver();

        await expect(
            callFindByVision(driver, 'item')
        ).rejects.toThrow('requires a "model" argument');
    });

    it('uses custom model when provided', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue(makeLLMResponse(1, 'item'));

        await callFindByVision(driver, 'item', 'claude-haiku-4-5-20251001');

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
        );
    });

    it('passes the annotated image as base64 in the LLM request', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue(makeLLMResponse(1, 'item'));

        await callFindByVision(driver, 'item', 'claude-opus-4-6');

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: expect.arrayContaining([
                            expect.objectContaining({
                                type: 'image',
                                source: expect.objectContaining({ data: Buffer.from('fake-annotated-png').toString('base64') }),
                            }),
                        ]),
                    }),
                ]),
            })
        );
    });

    it('does not include annotatedImageBase64 by default', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue(makeLLMResponse(1, 'item'));

        const result = await callFindByVision(driver, 'item', 'claude-opus-4-6');

        expect(result.annotatedImageBase64).toBeUndefined();
    });

    it('includes annotatedImageBase64 when opted in', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue(makeLLMResponse(1, 'item'));

        const result = await callFindByVision(driver, 'item', 'claude-opus-4-6', true);

        expect(result.annotatedImageBase64).toBe(Buffer.from('fake-annotated-png').toString('base64'));
    });

    it('falls back to non-primary monitor when primary not found', async () => {
        const driver = makeMockDriver({
            getWindowRect: { x: 0, y: 0, width: 2147483647, height: 2147483647 },
            monitors: [{ primary: false, bounds: { width: 2560, height: 1440 } }],
        });
        setMarks([{ x1: 95, y1: 95, x2: 105, y2: 105 }]);
        mockCreate.mockResolvedValue(makeLLMResponse(1, 'item'));

        const result = await callFindByVision(driver, 'item', 'claude-opus-4-6');

        // Falls back to first monitor: scaleX = 2560/1920, scaleY = 1440/1080
        expect(result.x).toBe(Math.round(0 + 100 * (2560 / 1920)));
        expect(result.y).toBe(Math.round(0 + 100 * (1440 / 1080)));
    });

    describe('OpenAI provider', () => {
        beforeEach(() => {
            process.env.OPENAI_API_KEY = 'openai-test-key';
        });

        it('calls OpenAI API for gpt-4o model', async () => {
            const driver = makeMockDriver();
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: JSON.stringify({ tag: 1, label: 'button' }) } }],
                }),
            });

            const result = await callFindByVision(driver, 'button', 'gpt-4o');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({ 'Authorization': 'Bearer openai-test-key' }),
                })
            );
            expect(result.label).toBe('button');
        });

        it('throws on OpenAI API error response', async () => {
            const driver = makeMockDriver();
            mockFetch.mockResolvedValue({
                ok: false,
                statusText: 'Unauthorized',
                text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key' } })),
            });

            await expect(
                callFindByVision(driver, 'button', 'gpt-4o-mini')
            ).rejects.toThrow('OpenAI API error: Invalid API key');
        });
    });

    describe('Google Gemini provider', () => {
        beforeEach(() => {
            process.env.GEMINI_API_KEY = 'gemini-test-key';
        });

        it('calls Gemini API for gemini- model', async () => {
            const driver = makeMockDriver();
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{ content: { parts: [{ text: JSON.stringify({ tag: 1, label: 'icon' }) }] } }],
                }),
            });

            const result = await callFindByVision(driver, 'icon', 'gemini-2.0-flash');

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('generativelanguage.googleapis.com'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-test-key' }),
                })
            );
            expect(result.label).toBe('icon');
        });

        it('throws on Gemini API error response', async () => {
            const driver = makeMockDriver();
            mockFetch.mockResolvedValue({
                ok: false,
                statusText: 'Bad Request',
                text: () => Promise.resolve(JSON.stringify({ error: { message: 'API key not valid' } })),
            });

            await expect(
                callFindByVision(driver, 'icon', 'gemini-1.5-pro')
            ).rejects.toThrow('Gemini API error: API key not valid');
        });
    });
});
