import { BasePlugin } from 'appium/plugin';
import type { ExecuteMethodMap, ExternalDriver, NextPluginCallback } from '@appium/types';
import { findByVision } from './find-by-vision.js';

export class VisionPlugin extends BasePlugin {
    static override executeMethodMap: ExecuteMethodMap<VisionPlugin> = {
        'windows: findByVision': {
            command: 'findByVision',
            params: { required: ['prompt', 'model'], optional: ['includeAnnotatedImage'] },
        },
    };

    findByVision = findByVision;

    /**
     * Appium's plugin dispatcher (AppiumDriver.pluginsToHandleCmd) only gives a plugin a turn
     * for a given HTTP command if the plugin instance defines a method with that command's exact
     * name — for the classic `execute`/`executeScript` endpoint that name is `execute`.
     * `BasePlugin` only auto-implements `executeMethod` (a *different* name, which checks
     * `executeMethodMap`), never `execute` itself — so a plugin that only declares
     * `executeMethodMap` is invisible to the dispatcher for this route and never gets asked.
     * Overriding `execute` here and delegating into the inherited `executeMethod` (which does the
     * real `executeMethodMap` lookup and calls `next()` for anything it doesn't recognize) is what
     * actually makes `windows: findByVision` reachable via `driver.executeScript(...)`.
     */
    async execute(next: NextPluginCallback, driver: ExternalDriver, script: string, args: unknown[]): Promise<unknown> {
        return await this.executeMethod(next, driver, script, args as [Record<string, unknown>]);
    }
}

export default VisionPlugin;
