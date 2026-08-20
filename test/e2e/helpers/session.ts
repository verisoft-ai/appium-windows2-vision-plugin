import { remote } from 'webdriverio';
import type { Browser } from 'webdriverio';

export const APPIUM_SERVER = {
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',
};

export const CALCULATOR_APP_ID = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';

type Caps = WebdriverIO.Capabilities;

export async function createCalculatorSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': CALCULATOR_APP_ID,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 1500 });
    return driver;
}

export async function quitSession(driver: Browser | null): Promise<void> {
    try {
        await driver?.deleteSession();
    } catch {
        // noop — session may already be terminated
    }
}

/** Click the Calculator clear button to reset the display to 0 */
export async function resetCalculator(driver: Browser): Promise<void> {
    const clearBtn = await driver.$('~clearButton');
    await clearBtn.click();
}
