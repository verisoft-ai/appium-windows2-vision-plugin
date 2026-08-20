import { BasePlugin } from 'appium/plugin';
import type { ExecuteMethodMap } from '@appium/types';
import { findByVision } from './find-by-vision.js';

export class VisionPlugin extends BasePlugin {
    static override executeMethodMap: ExecuteMethodMap<VisionPlugin> = {
        'windows: findByVision': {
            command: 'findByVision',
            params: { required: ['prompt', 'model'], optional: ['includeAnnotatedImage'] },
        },
    };

    findByVision = findByVision;
}

export default VisionPlugin;
