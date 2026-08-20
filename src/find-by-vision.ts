import type { ExternalDriver, NextPluginCallback } from '@appium/types';
import {
    CoordMapping,
    VisionStep,
    computeCoordMapping,
    formatVisionError,
    getApiKeyEnvVar,
    getProviderForModel,
    locateElementByVision,
} from './vision-utils.js';

/** Every driver capable of running windows: findByVision implements both commands. */
type ScreenshotCapableDriver = ExternalDriver & Required<Pick<ExternalDriver, 'getWindowRect' | 'getScreenshot'>>;

async function buildCoordMapping(
    driver: ScreenshotCapableDriver,
    ssW: number,
    ssH: number,
): Promise<CoordMapping> {
    const rect = await driver.getWindowRect();
    const isRoot = rect.width > 10000;

    if (isRoot) {
        const monitors = await driver.executeMethod('windows: getMonitors', []) as Array<{
            primary: boolean;
            bounds: { width: number; height: number };
        }>;
        const primary = monitors.find((m) => m.primary) ?? monitors[0];
        return computeCoordMapping(
            true,
            rect.x, rect.y, rect.width, rect.height,
            1, ssW, ssH,
            primary?.bounds?.width, primary?.bounds?.height,
        );
    }

    const dpiScale = await driver.executeMethod('windows: getDpiScale', []) as number;
    return computeCoordMapping(
        false,
        rect.x, rect.y, rect.width, rect.height,
        dpiScale,
        ssW, ssH,
    );
}

/**
 * Locates a UI element by sending a screenshot and natural-language prompt to a vision-capable
 * LLM, then maps the model's screenshot-space coordinates back to screen coordinates.
 *
 * Registered under `windows: findByVision` in {@link VisionPlugin}'s `executeMethodMap` —
 * dispatched here as positional args (prompt, model, includeAnnotatedImage) per BasePlugin's
 * executeMethod convention (`command.call(this, next, driver, ...args)`).
 */
export async function findByVision(
    this: { log?: { info: (msg: string) => void } },
    _next: NextPluginCallback,
    driver: ExternalDriver,
    prompt: string,
    model: string,
    includeAnnotatedImage?: boolean,
): Promise<{ x: number; y: number; label: string; steps: VisionStep[]; annotatedImageBase64?: string }> {
    if (!prompt) {
        throw new Error('windows: findByVision requires a "prompt" argument.');
    }
    if (!model) {
        throw new Error(
            'windows: findByVision requires a "model" argument. ' +
            'Supported prefixes: claude-* (ANTHROPIC_API_KEY), gpt-*/o-series (OPENAI_API_KEY), ' +
            'gemini-* (GEMINI_API_KEY), amazon.nova-*/us.amazon.nova-*/eu.amazon.nova-*/ap.amazon.nova-* (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY).'
        );
    }
    const provider = getProviderForModel(model);
    const envVar = getApiKeyEnvVar(provider);
    const apiKey = process.env[envVar];
    if (!apiKey) {
        throw new Error(
            `${envVar} environment variable is required for windows: findByVision (model: ${model})`
        );
    }
    if (provider === 'amazon' && !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('AWS_SECRET_ACCESS_KEY environment variable is required for Amazon Bedrock models');
    }

    if (!driver.getScreenshot || !driver.getWindowRect) {
        throw new Error('windows: findByVision requires a driver that implements getScreenshot and getWindowRect.');
    }
    const screenshotDriver = driver as ScreenshotCapableDriver;

    const base64 = await screenshotDriver.getScreenshot();

    try {
        const result = await locateElementByVision({
            prompt,
            model,
            apiKey,
            screenshotBase64: base64,
            buildMapping: (ssW, ssH) => buildCoordMapping(screenshotDriver, ssW, ssH),
            includeAnnotatedImage,
        });
        this.log?.info(`[findByVision] steps:\n${result.steps.map((s) => `  [${s.status}] ${s.name}: ${s.detail}`).join('\n')}`);
        return result;
    } catch (err) {
        throw new Error(formatVisionError(err));
    }
}
